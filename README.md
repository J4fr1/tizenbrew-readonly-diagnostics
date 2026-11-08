# TizenBrew read-only diagnostics

An experimental, one-shot prerequisite inventory for a Samsung Tizen TV service. This is not a root exploit and does not disable applications or services.

The script reads selected operating-system and process information, checks known runtime paths, and serves one JSON report at `http://127.0.0.1:18082/report` on the TV. The listener closes after retrieval or 120 seconds. It has no authentication; other processes on the TV may access it during that window. It does not bind to the TV's LAN interface.

The script performs no filesystem writes, subprocess execution, settings changes, or outbound requests. TizenBrew itself must download the script to load it. Reports stay on the TV until retrieved; no report is uploaded to this repository or a public service by this script.

## Status

Syntax checked and tested locally with simulated Tizen, filesystem, and networking objects. Not yet tested on a TV. ES5 syntax and legacy Buffer APIs are intentional for Node 4.4 compatibility, which still requires live verification.

## Loading and cleanup boundaries

The reviewed TizenBrew service loader accepts a StartService event and downloads code through jsDelivr. Use an immutable Git commit and independently verify the downloaded bytes before loading. Do not add this module to the saved module or autostart configuration.

The listener closes itself, but TizenBrew retains the service VM entry until its service process exits. Closing the visible app may not terminate that process. A TV restart ends the process; the script does not request or perform a restart.

File modes do not establish file capabilities. Directory names do not prove a usable .NET runtime. This inventory does not test namespaces or privilege escalation. An unexpected runtime error can interrupt the diagnostic or its host service.

Do not submit unredacted reports to public issues. This repository is intended to contain generic source code and documentation only.
