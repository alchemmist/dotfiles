---
name: rebase
description: Use only when the user explicitly invokes $rebase to rebase the current Git or Arc PR branch onto the repository default branch and update its remote branch with the strongest available remote-head guard.
---

# Rebase

Rebase the current pull-request branch onto the latest remote default branch, then update the same remote branch. An explicit `$rebase` invocation authorizes the guarded history rewrite and push for an unambiguously owned PR branch.

1. Detect the repository type before choosing commands: use Git for Git repositories and Arc for Arcadia. Inspect the current branch, working tree, upstream, push target, and remote default branch. Stop on a detached HEAD, the default branch itself, uncommitted changes, an ambiguous push target, or an Arc branch that is shared or not clearly owned by the current user. Preserve user changes; do not stash them automatically.
2. Fetch the relevant remote refs. Record the current object ID of the remote PR branch before rewriting history.
3. Rebase the current branch onto the freshly fetched remote default branch. Resolve conflicts according to the intended behavior of both changes, without dropping either side merely to finish the rebase.
4. Run focused validation appropriate to files changed during conflict resolution. If validation fails, fix the cause or stop with the exact failure.
5. Re-check the current branch, target remote, and target branch immediately before publishing, then use the repository-specific guard:
   - **Git:** push `HEAD` to the explicit target branch with `--force-with-lease=<branch>:<recorded-object-id>`.
   - **Arc:** fetch the explicit remote PR branch again and resolve its current remote object ID. If it exactly matches the recorded object ID, immediately run `arc push --force` to the already verified upstream branch. Arc has no atomic force-with-lease, so the fetch-and-compare check is its strongest available guard.
6. If the remote object ID changed, stop and report both object IDs. Do not overwrite the branch or retry with a weaker guard. For Arc, do not stop merely because `arc push` lacks `--force-with-lease`; the exact pre-push comparison in step 5 is the approved Arc path.
7. Report the base branch, rebased commit range, validation performed, and updated remote branch.
