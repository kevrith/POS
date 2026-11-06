# resources

`server.tar.gz` is the offline server (Node, the API, Prisma, PostgreSQL) that the installer carries and the app unpacks on
first use. It is generated, ignored by git, and rebuilt by `apps/desktop/scripts/build-server-bundle.mjs`. A developer build
has an empty placeholder (made by `build.rs`), and the app says so when asked to start a server.
