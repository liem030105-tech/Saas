---
description: Report the next task to implement and anything blocking it
---

Do not modify any files.

1. Read the status table in `docs/tasks/README.md` (the only place status is tracked) and `docs/decisions/DECISIONS-REQUIRED.md`.
2. Find the first task in the table's order whose status is **Todo** and whose "Depends on" tasks are all **Done**.
3. For that task, check its "Blocked by" column and the matching `D-xx` items: a decision marked **Blocking: yes** for this task that is not **Resolved** blocks it.
4. Report, in a few lines:
   - the task ID, title, and spec path;
   - blocking decisions, each with its question and the recommended option, or "none";
   - tasks that could run in parallel with it (from the table);
   - the command to start it: `/implement <TASK-ID>`.
5. If the task is blocked, also name the next unblocked task, and suggest `/decide D-xx` for the blocker.
