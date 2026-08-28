---
name: archive_chat
description: Archive the current conversation as a dated session record under SDD-history/.
argument-hint: "optional topic, appended to the filename"
disable-model-invocation: true
---

Write the session's **record**: what was decided, what was measured, what went wrong. It joins the earlier records in `SDD-history/`, and it is written for someone who was not there.

A record is not a transcript and not a summary. The transcript is already on disk; a summary of it would restate what the code, the issues and the commits already say. The record carries what only a participant knows: why each fork went the way it did, and which turns were wrong.

## 1. Name the file

Take the timestamp from `date +%Y%m%d%H%M%S`.

- **With an argument**: `SDD-history/<stamp>-<argument>.md`, the argument lower-cased with runs of non-alphanumerics collapsed to single hyphens.
- **Without**: `SDD-history/<stamp>.md`.

## 2. Read the transcript before writing a word

A long conversation is compacted as it grows, so its opening rounds are usually gone from context by the time this skill runs. Written from context alone, the record comes out plausible exactly where it needs to be accurate — and the early turns are where the destination was chosen, which is the part a future reader most needs.

Transcripts live at `~/.claude/projects/<cwd with / and _ as ->/<session-id>.jsonl`, one JSON object per line. The current session is the most recently modified file there. They run to tens of megabytes: read in slices, and pull the user's turns and your own text rather than every tool result.

Read one existing `SDD-history/*.md` too. It is the format's only source of truth, and it drifts.

**Done when every exchange is accounted for**, including the ones that produced nothing.

## 3. Write it

Open with the date range, links to whatever the session produced (issues, commits, branches, artifacts), and a one-line outcome. Say in a blockquote that it is reconstructed rather than verbatim. Then the work in the order it happened, and close with an **Outstanding** section.

Four standards carry the file:

- **Decisions carry both the recommendation and the choice.** Put them in a table with a **Recommended** and a **Chosen** column. The divergences are the signal — where the human overruled you is where judgement entered, and it is the one thing no later reader can reconstruct from the result.
- **Measured, not claimed.** "Verified from the PNG header: 69151×2152" outranks "export works". Carry the number and say how it was obtained.
- **Write the failures in.** The wrong turn, the false alarm, the correction you had to issue against your own earlier claim, the cost of a mistake. These paragraphs are the most valuable in the file, because the code shows what was built and only the record shows what it cost to find.
- **Link rather than restate.** An issue, commit, file or artifact carries its own detail; name it and move on.

## 4. Say what the record could not cover

Name it in the chat: exchanges that survived only in a compacted region, work whose outcome is still unknown, claims you recorded but could not verify. A record trusted past its accuracy is worse than a short one.
