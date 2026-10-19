# Web9.AI Development Guide

> **Migration input only.** The migration scripts read this tree as text (`scripts/lib/legacy-tree.mjs`, `posts.mjs`, `legacy-anchors.mjs`), and it is removed after cutover. Its `package.json` and `package-lock.json` were removed on 2026-10-18: nothing installed them, and the old Docusaurus dependencies carried about 156 Dependabot alerts. To build the old site, restore them first: `git checkout 83b0f67b -- legacy/package.json legacy/package-lock.json`.

## Development Commands

- Start development server: `npm run start`
- Start in Chinese locale: `npm run startcn`
- Build for production: `npm run build`
- Serve production build: `npm run serve`
- Clear cache: `npm run clear`
- Type checking: `npm run typecheck`

## Code Style Guidelines

- **TypeScript**: Use TypeScript for all components and utilities
- **Types**: Define explicit types for props, state, and function parameters
- **Components**: Use functional components with explicit return types
- **Imports**: Group imports by type (React, third-party, local)
- **Translations**: Use `<Translate>` component for internationalized content
- **Props**: Destructure props in function parameters
- **Constants**: Use UPPERCASE for constants

## Project Structure

- `/src/components/` - React components
- `/src/css/` - CSS styling
- `/src/pages/` - Page components
- `/docs/` - Documentation content
- `/blog/` - Blog posts
- `/static/` - Static assets

This is a Docusaurus project with TypeScript support running React 19.