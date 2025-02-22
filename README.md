## Setup

```
$ yarn install
```

File `public/app-config.json` must be created by duplicating `public/app-config.template.json` and filling in the encryptionKey.

## Migrations

The app uses the DHIS2 data store to persist custom data. Whenever the schema of the data store changes, we'll create a [migration task](src/migrations/tasks) with an incremental version. \*.ts files in this folder are automatically loaded.

When writing a migration, we must define the old/new types of data structures used in that migration task. Note that we cannot rely on types on the app, as they may have diverged. For fields/objects we must reference but don't care the type, we will use `unknown` (not `any`).

When the app starts, it will check the data store version and open a dialog if a migration is required. You can also run the migrations on the CLI:

```
$ yarn migrate 'http://admin:PASSWORD@localhost:8080'
```

## Scheduler

The app provides a server-side scheduler script that runs synchronization rules in the background. The script requires Node v10+ and can be executed like this:

```
$ node metadata-synchronization-server.js -c app-config.json
```

To connect to the destination instance, it requires a configuration file. If no configuration file is supplied the following is used as a placeholder:

```json
{
    "encryptionKey": "encryptionKey",
    "baseUrl": "https://play.dhis2.org/2.30",
    "username": "admin",
    "password": "district"
}
```

## Development

### Start the development server of the main application:

```
$ yarn start
```

Now in your browser, go to `http://localhost:8081`.

Notes:

-   Requests to DHIS2 will be transparently proxied (see `src/setupProxy.js`) from `http://localhost:8081/dhis2/path` to `http://localhost:8080/path` to avoid CORS and cross-domain problems.

-   The optional environment variable `REACT_APP_DHIS2_AUTH=USERNAME:PASSWORD` forces some credentials to be used by the proxy. This variable is usually not set, so the app has the same user logged in at `REACT_APP_DHIS2_BASE_URL`.

-   The optional environment variable `REACT_APP_PROXY_LOG_LEVEL` can be helpful to debug the proxyfied requests (accepts: "warn" | "debug" | "info" | "error" | "silent")

-   Create a file `.env.local` (copy it from `.env`) to customize environment variables so you can simply run `yarn start`.

-   [why-did-you-render](https://github.com/welldone-software/why-did-you-render) is installed, but it does not work when using standard react scripts (`yarn start`). Instead, use `yarn craco-start` to debug re-renders with WDYR. Note that hot reloading does not work out-of-the-box with [craco](https://github.com/gsoft-inc/craco).

### Customization of the development server:

```
$ yarn start -p 8082 core-app|data-metadata-app|module-package-app|modules-list|package-exporter|msf-aggregate-data-app
```

This will open the development server for the given front-end at port 8082 and will connect to DHIS 2 instance http://localhost:8080.

### Customize DHIS2 instance url

```
REACT_APP_DHIS2_BASE_URL=http://localhost:8080
```

To use a different DHIS2 instance url set this environment variable before running a ``start`` command.

## Tests

Run unit tests:

```
$ yarn test
```

Run integration tests locally:

```
$ export CYPRESS_DHIS2_AUTH='admin:district'
$ export CYPRESS_EXTERNAL_API="http://localhost:8080"
$ export CYPRESS_ROOT_URL=http://localhost:8081
$ export CYPRESS_ENCRYPTION_KEY=anyKey

$ yarn cy:e2e:run # non-interactive
$ yarn cy:e2e:open # interactive UI
```

Application should be running at CYPRESS_ROOT_URL with as the environment variable REACT_APP_CYPRESS set to True.

For this to work in Travis CI, you will have to create an environment variables (Settings -> Environment Variables) CYPRESS_DHIS2_AUTH with the password used in your testing DHIS2 instance and CYPRESS_ENCRYPTION_KEY used to encrypt passwords of receiver instances.

Note tests only pass on the testing docker instance eyeseetea/dhis2-data:2.30-datasync-sender

## Build

To build all the front-ends:

```
$ yarn build
```

To build a given front-end:

```
$ yarn build [all|core-app|data-metadata-app|module-package-app|modules-list|package-exporter|msf-aggregate-data-app]
```

To build the scheduler:

```
$ yarn build-scheduler
```

## i18n

### Update an existing language

```
$ yarn update-po
# ... add/edit translations in po files ...
$ yarn localize
```
