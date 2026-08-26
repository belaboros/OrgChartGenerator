/**
 * PNG encoder.
 *
 * Why not `canvas.toDataURL()`: #19 measured that past **65535 px in a single
 * dimension** a canvas cannot be created at all, and `toDataURL` returns the empty
 * string `data:,` with no exception and no warning. `acme-large` under
 * `left-to-right` is 17288 px wide, so a 4x export needs 69152 px — over the cap.
 *
 * So the image is rendered in tiles that each fit comfortably inside canvas limits,
 * and the PNG is assembled from their scanlines directly. PNG itself allows
 * dimensions up to 2^31-1, so the format was never the constraint; the canvas was.
 *
 * Deflate comes from CompressionStream('deflate'), which emits zlib-wrapped
 * deflate — exactly what an IDAT chunk holds.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(12 + data.length))
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export class ExportTooLarge extends Error {}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  tiles: number
}

const SIGNATURE = new Uint8Array(new ArrayBuffer(8))
SIGNATURE.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Chrome refuses a canvas beyond this in either direction; stay well inside it. */
const TILE = 4096
/** Rows buffered before being handed to the deflater. Bounds peak memory. */
const BAND = 256

export async function renderSvgToPng(
  svg: SVGSVGElement,
  diagramWidth: number,
  diagramHeight: number,
  scale: number,
): Promise<ExportResult> {
  const W = Math.round(diagramWidth * scale)
  const H = Math.round(diagramHeight * scale)

  // PNG's own limit. Nothing this project can produce approaches it, but a silent
  // wrong answer is the specific failure this module exists to prevent.
  if (W > 2147483647 || H > 2147483647 || W < 1 || H < 1) {
    throw new ExportTooLarge(`A ${W}×${H} image is outside what PNG can describe.`)
  }
  if (typeof CompressionStream === 'undefined') {
    throw new ExportTooLarge('This browser cannot compress the image (CompressionStream is missing).')
  }

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-export-hide]').forEach((el) => el.remove())
  const world = clone.querySelector('g')
  if (world) world.setAttribute('transform', 'translate(0,0) scale(1)')
  clone.setAttribute('width', String(diagramWidth))
  clone.setAttribute('height', String(diagramHeight))
  clone.setAttribute('viewBox', `0 0 ${diagramWidth} ${diagramHeight}`)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }),
  )
  const img = new Image()
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new ExportTooLarge('The diagram could not be rasterised.'))
      img.src = url
    })
  } finally {
    // Revoked after decode; the Image keeps its own copy.
    queueMicrotask(() => URL.revokeObjectURL(url))
  }

  const cols = Math.ceil(W / TILE)
  const rows = Math.ceil(H / BAND)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new ExportTooLarge('This browser did not provide a 2D context.')

  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  const collected: Uint8Array[] = []
  const draining = (async () => {
    const reader = cs.readable.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      collected.push(value as Uint8Array)
    }
  })()

  const scanline = new Uint8Array(1 + W * 4)
  let tiles = 0

  for (let r = 0; r < rows; r++) {
    const y0 = r * BAND
    const bandH = Math.min(BAND, H - y0)
    // One band of full-width RGBA, stitched from however many tiles it takes.
    const band = new Uint8ClampedArray(W * bandH * 4)
    for (let c = 0; c < cols; c++) {
      const x0 = c * TILE
      const tileW = Math.min(TILE, W - x0)
      canvas.width = tileW
      canvas.height = bandH
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, tileW, bandH)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tileW, bandH)
      ctx.setTransform(scale, 0, 0, scale, -x0, -y0)
      ctx.drawImage(img, 0, 0, diagramWidth, diagramHeight)
      const data = ctx.getImageData(0, 0, tileW, bandH).data
      for (let y = 0; y < bandH; y++) {
        band.set(data.subarray(y * tileW * 4, (y + 1) * tileW * 4), (y * W + x0) * 4)
      }
      tiles++
    }
    for (let y = 0; y < bandH; y++) {
      scanline[0] = 0 // filter: none
      scanline.set(band.subarray(y * W * 4, (y + 1) * W * 4), 1)
      await writer.write(scanline.slice())
    }
  }

  await writer.close()
  await draining

  const ihdr = new Uint8Array(new ArrayBuffer(13))
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, W)
  dv.setUint32(4, H)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idatLength = collected.reduce((a, b) => a + b.length, 0)
  const idatData = new Uint8Array(new ArrayBuffer(idatLength))
  let at = 0
  for (const part of collected) {
    idatData.set(part, at)
    at += part.length
  }

  const blob = new Blob(
    [
      SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', idatData),
      chunk('IEND', new Uint8Array(0)),
    ],
    { type: 'image/png' },
  )
  return { blob, width: W, height: H, tiles }
}
