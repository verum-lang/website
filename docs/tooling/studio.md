---
sidebar_position: 4
title: Verum Studio
description: A local graphical workspace for Verum scripts, reviewed agent edits, and source-bound proof evidence.
---

# Verum Studio

Verum Studio opens a workspace in your browser. Edit Verum source, run a
script, check a module, or check a logical theorem while keeping the source
and results visible together. The terminal [Playbook](./playbook.md) remains
available for notebook cells and `.vrbook` replay.

## Start a workspace

Build the standalone Studio host and source proof worker from the Verum
repository:

```bash
cargo build --release -p verum_workbench -p verum_source_proof
mkdir -p experiments
target/release/verum-studio --workspace ./experiments \
  --verum /path/to/verum \
  --proof ./target/release/verum-source-replay
```

Open the local URL printed by the process. The URL contains the session
credential; keep it private. The editor assets are bundled, so editing and
local execution do not need a CDN or a running Node.js service.

CLI builds containing Studio also provide `verum studio DIRECTORY`, with
`verum playground` as an alias. `--codex` selects the Codex executable;
`--proof` selects the source proof worker. The default executable names
are resolved through `PATH`.

Studio listens on the loopback interface. Remote hosting, shared workspaces,
and collaborative editing are not supported. Programs run with your local
account permissions: open and execute code you trust. The outer time and
output budgets are execution limits, not an operating-system sandbox.

## Arrange your workspace

The arrows in panel headers collapse Explorer and Collaborator into narrow
rails with file and agent status, and Results into a summary strip. Select a
rail or the Results arrow to restore it. Drag a divider to resize a panel;
with the divider focused, use the arrow keys, Home or End, or Enter to collapse.
Panel sizes and collapse preferences are saved in this browser.

Studio preserves space for the editor as the window narrows. Expanding a side
panel gives it priority when both side panels cannot fit. On small screens,
use the bottom navigation to switch panes. In short windows, expanding Results
uses the central area; collapsing it returns to the editor. Scrollbars remain
subtle at rest and appear during interaction.

| Action | Shortcut |
| --- | --- |
| Toggle Explorer | Command/Ctrl + B |
| Toggle Collaborator | Command/Ctrl + Shift + B |
| Toggle Results | Command/Ctrl + J |
| Save source | Command/Ctrl + S |
| Run source | Command/Ctrl + Enter |
| Check module | Command/Ctrl + Shift + Enter |

## Choose an interface language

Use the language selector in the top bar to choose English or Russian.
Studio initially follows a supported browser language and remembers an explicit
choice. Switching updates the interface, accessibility labels and editor search
without reloading the workspace or discarding drafts, undo history or active
operations. Source code, compiler diagnostics, proof reports and agent responses
retain their original text.

## Explore a script

The starter experiment is a complete Verum script:

```verum
let answer = 6 * 7;
print(answer);
```

Choose **Run** to execute it through the CLI's stdin scripting entry.
The output is `42`. The submitted buffer is executed even if it has not
been saved. Script mode uses the same language and standard-library
implementation as the CLI; Studio does not translate experiments into
another language.

**Check module** runs `verum check` on a source snapshot. Use it for module
source, such as:

```verum
fn main() {
    print(42);
}
```

The module checker and stdin scripting entry have different entry syntax.
A top-level script is compiled when you run it; **Check module** does not
convert that script into a module.

Studio serializes its own saves and compares the disk revision with the
revision you opened before replacing a file. A detected external edit
refuses the save and leaves your draft available for review. This is
optimistic conflict detection: an independent writer can still race the
filesystem replacement. Avoid simultaneous writes while applying changes.
Only regular `.vr` files inside the workspace are exposed; hidden paths,
parent traversal, and symlinks are refused.

## Inspect proof evidence

Open the identity example, select declaration `identity`, and choose
**Prove**:

```verum
theorem identity(A: Type, x: A): A proof = x;
```

The source worker checks this declaration using the explicit
[`verum-source-pi-id/1` logical profile](./native-proof-replay.md).
Changing the proof term from `x` to `A` produces a rejection. This is a
logical proof judgment; it does not establish runtime implementation
correspondence or empirical usefulness.

Each result identifies its source revision. Editing the buffer marks an
older result as belonging to a different revision. Inspect the detailed
proof report for the declaration, source span, checked judgment, and
diagnostic. A worker crash or missing report is inconclusive; exhausting
a resource limit is not a rejected theorem.

## Work with an agent

Studio connects to a local Codex CLI through its app-server protocol.
Choose **Connect**, then sign in with ChatGPT when requested. No API key is
required. Use a current Codex installation that supports app-server v2 and
dynamic tools. Account access and subscription usage limits still apply.

Studio owns a separate provider profile in the operating system's local
application-data directory under `VerumStudio/codex`. It does not copy
another application's credentials or store them inside your project.
Authentication remains in Codex's supported login flow.

The conversation includes the selected source and whether it contains
unsaved edits. The agent can request reads, propose a complete source
replacement, run a script, check a module, or check a theorem. Review the
request before allowing it. Source replacements show the proposed content
and require the expected disk revision. Built-in shell requests are not
accepted by Studio; execution tools use Verum.

The integration uses the
[Codex app-server authentication and tool protocol](https://learn.chatgpt.com/docs/app-server).
Claude subscription integration is not provided: the
[Claude Agent SDK documentation](https://code.claude.com/docs/en/agent-sdk/overview)
requires Anthropic approval for third-party products offering Claude
subscription login. Studio does not substitute an API-key flow for that
requirement.

## Keep an experiment inspectable

Studio retains each submitted source and execution receipt under
`.verum-studio/runs/` in the workspace. A receipt records the operation,
source hash, executable path, time budget, output, exit information, and
proof report when available. Recent results are restored after a restart;
a run interrupted by shutdown is inconclusive.

This binds the result to the entry source, not to a frozen copy of all
project dependencies, the compiler binary, or the operating system.
Imported files can change independently. Preserve those artifacts separately
when a reproducible whole-project claim requires them.

At most two operations run concurrently. Each output stream is bounded;
the outer wall-time limit is configurable up to five minutes. Cancellation
terminates the child process; on Unix it also terminates its process group.
The proof worker additionally enforces its own admission and process limits.
These bounds do not prove that every internal arithmetic operation is
interruptible or charged to a semantic work budget.

## Inspect language analysis and project structure

Studio runs the same LSP service used by `verum lsp` on a dedicated analysis
worker. Diagnostics refer to the current buffer, including unsaved edits.
Select the analysis indicator in the editor status bar to open **Diagnostics**;
select a diagnostic to navigate to its source range. Completion and hover use
the language server, and **F12** navigates to a definition. Navigation to another
file preserves the existing review flow for unsaved changes.

**Structure** projects declarations and explicit context requirements from the
language server's parsed AST. Select a declaration or requirement to return to
its source. The project inspector combines the workspace file inventory with
analyzed document snapshots. Each snapshot carries its document version,
source hash and project generation hash. Closed dependencies can be marked as
**Indexed source**: their declarations are available for imports, while their
bodies have not received the open-buffer check. Other files are marked as not
analyzed.
Invalid or pending source revisions do not display an older structure as current.

The shared service resolves module-path imports against captured project sources
and local path dependencies, using the compiler's module registry and declaration
preparation. **Structure** displays resolved import bindings and inferred declaration
types; imported definitions navigate to their declaring source, including through
aliases and re-exports. Dependency edits invalidate unchanged consumers as well.
Use the project refresh control after external changes; returning focus also
refreshes the current source analysis.

`verum studio` uses the release compiler's embedded standard-library metadata.
The standalone server accepts `--stdlib-metadata /path/to/runtime.core_metadata`
from the matching release. The editor, Structure view and reviewed agent tools
share the same metadata identity and type analysis. Library symbols without
source text display their types and declaring module without a navigation target.
A standalone server without that artifact reports analysis with builtins.

Installed binary cogs and source-only blanket protocol seeding remain outside this
editor path. Whole-project build and proof acceptance still requires the
corresponding CLI operation. Analysis requests have a time limit; large library
implementation sets can exceed it. A timed-out analysis is not a successful check.
The declaration/context view is a source
projection for exploring Architecture as Type; it is not evidence of runtime
implementation correspondence. See [LSP analysis scope](./lsp.md#diagnostics)
for source-capture limits and dependency coverage.
The live analysis uses module syntax. Run top-level scripts through **Run**;
module-analysis errors alone do not establish that a script is invalid.

The reviewed agent tools `verum_analyze` and `verum_project` use this same
service and snapshot format. Analysis can inspect submitted source without
writing it to disk; omitting source analyzes the saved file. Language inspection
cannot execute arbitrary LSP commands or bypass workspace path restrictions.

MCP transport, a complete cross-module architecture graph, native-case artifact
import, interactive debugger stepping, and durable conversation resumption are
not integrated into Studio. Existing terminal tools remain separate capabilities.
