# Student Carpool & Transportation App

A mobile app that lets University of North Texas (UNT) students find, offer, and coordinate carpool rides to and from campus.

Built for CSCE 3444 (Software Engineering), Section 400 — **Group 1**.

## Team

| Name | Role Focus |
|---|---|
| Himal Gautam | Backend / Database (PostgreSQL, PostGIS, real-time chat) |
| Ayush BHandari | UI/UX (auth, profile, ride screens) |
| Jared Blumenthal | Backend & Maps integration (rides, ratings) |
| Ryan Moody | Auth backend, notifications, testing |

## Tech Stack

- **Frontend:** React Native + Expo
- **Backend:** Node.js / Express
- **Database:** PostgreSQL with PostGIS extension (spatial queries)
- **Real-time:** Socket.IO (in-app chat)
- **Maps:** Google Maps Platform
- **Notifications:** Expo Notifications

## Project Overview

The app allows verified UNT students (`@my.unt.edu` email required) to:
- Offer a ride by posting route, time, and available seats
- Search for and request available rides using location-based matching
- Chat in real time with drivers/riders to coordinate pickup details
- Rate and review rides after completion
- Report safety issues through an in-app help/report module

Full functional requirements (FR-01–FR-18) are documented in the Software Requirements Specification (`3444_SRS_V1_0.docx`), version 1.0, submitted Sep 8, 2026.

## Project Management

- **Production Plan:** task list with priorities, assignees, and time estimates for Sprint One and Sprint Two
- **Trello Board:** tracks task status (Backlog / To Do / Doing / Done)
- **GitHub Projects:** Kanban board mirroring the same workflow

## Status
In active development — Sprint One in progress.
