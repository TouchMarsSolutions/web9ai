# Website

> **Migration input only.** The migration scripts read this tree as text (`scripts/lib/legacy-tree.mjs`, `posts.mjs`, `legacy-anchors.mjs`), and it is removed after cutover. Its `package.json` and `package-lock.json` were removed on 2026-10-18: nothing installed them, and the old Docusaurus dependencies carried about 156 Dependabot alerts. To build the old site, restore them first: `git checkout 83b0f67b -- legacy/package.json legacy/package-lock.json`.

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
