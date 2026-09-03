# Ledgerly Roadmap

## Done
- [x] Old-CRM CSV FTDs atomically connect Leads, Clients, Income and Daily numbers without double-counting existing Daily totals.
- [x] Full-width data workspace and a draggable, persistent desktop sidebar width.
- [x] Leads-first pipeline: dense individual-lead grid, assignment and contact actions, explicit conversion to clients, daily-number reporting tab, and removal of direct client creation from Clients, Income, and AI paste.
- [x] Role separation: conversion agents default to Leads without Clients access; retention agents remain scoped to their allocated Clients.
- [x] Command Center → Withdrawals: make "Open withdrawals" open the withdrawals page filtered to the exception clients and the correct date window.
- [x] Business assistant: permission-aware natural-language Q&A with real-time data tools and streaming chat UI.
- [x] Customizable dashboards: drag/drop/resize widgets, named saved layouts, CEO/Finance/Sales Manager templates at /dashboards.

## Next
- [x] Client 360 timeline: richer lead-to-lifecycle view with financial, communications, tasks, KYC, employee actions, and system event filters.
- [x] Scenario modelling: /scenarios page with funnel levers (lead volume, CPL, activation rate, FTD rate, avg FTD, fixed costs, payouts), presets and current-vs-scenario comparison.
- [x] Scenarios page: on-page guide explaining what the tool does and how to use it.
- Done: Next Best Action card on client profile (recommendation, evidence, conversation angle, call/WhatsApp/email/task/note/follow-up actions)

## Clients page (activations)
- [x] Retention agents see only clients allocated to them
- [x] Replace cramped/overlapping table with a comfortable list view (default) with details + actions

## Ask your data
- [x] Client notes become individually saved comments (no single free-text box)
- [x] Per-client, per-month deposit splits + full client directory in the AI snapshot so answers match real data and are never "truncated"

- Clients: added a third "Grid" view mode — dense spreadsheet grid with per-column filters, pinned name column, contact buttons and inline editing of retention/conversion agent, status and answered (optimistic saves).

- [x] Deposit requests: agent request form, admin approval with bank + per-bank invoice numbering (from 600), confirmation books income with fees and commission; banks managed in Settings.
- [x] Deposit requests: BSB shown in bank details; admin trash/delete button

## Access scoping (agents see only their own book)
- [x] Database rules: conversion/retention agents only read their own clients, income, withdrawals and leads (admins/managers unchanged)
- [x] "Request deposit" button on the client profile (shared deposit-request dialog)
- [x] Bulk "set employee" hidden for scoped agents on Income
- [x] Rename the "Agent" role to "Conversion" across the app
