# Website

> **Migration input only.** The migration scripts read this tree as text (`scripts/lib/legacy-tree.mjs`, `posts.mjs`, `legacy-anchors.mjs`), and it is removed after cutover. It cannot build the old site: its static assets moved to `public/`, and its `package.json` and `package-lock.json` were removed on 2026-10-18 (nothing installed them, and the old Docusaurus dependencies carried about 156 Dependabot alerts). Run nothing from inside `legacy/`. The complete Docusaurus source is the tag `docusaurus-final` (e.g. `git worktree add ../web9-docusaurus docusaurus-final`); the commands below are kept as the old site wrote them.

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
