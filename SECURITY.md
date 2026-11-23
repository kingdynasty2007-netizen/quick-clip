# Security policy

## Supported version

Security fixes are applied to the current code on the `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting or Security Advisory feature for this repository. Do not disclose suspected vulnerabilities in a public issue.

Include a concise description, reproduction steps, affected routes or Socket.IO events, and the potential impact. Remove credentials, tokens, room content, and other private data from reports and logs.

## Data model

Quick Clip uses ephemeral in-memory rooms and does not provide authentication or durable storage. Treat room links and codes as bearer secrets: anyone who knows a room code can attempt to join that room. Do not use Quick Clip for passwords, private keys, regulated data, or other sensitive information.
