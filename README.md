# listview

example: ./bin/run.js clone:listview -i /Users/ksmeets/Projects/SDO/listviewclone.csv -r /Users/ksmeets/Projects/SDO -n 3MVG9SOw8KERNN0.2nOtUkdNWY45cnwTDz8.PBwwCbu2F4vzAU.YYgnxrKWAMlkL2n3OipOVT7Z7d9A7iDL.w -k /Users/ksmeets/Projects/SDO/domain.key -u https://login.salesforce.com -s true

./bin/run.js clone:listview -i /Users/ksmeets/Projects/CGAMS/input/listviewclone2.csv -r /Users/ksmeets/Projects/CGAMS/output -n 3MVG9fdJGowvdgN0tzA5aHhCtwJfB8jhZrogdFw0ooE_lLhaT0I.PoBdMOAEGIzJnI3pZHU57l7AV1MCUgtlH -k /Users/ksmeets/Projects/CGAMS/private_key_sf2.pem -u <mydomain.my.salesforce.com>

prerequisites:

1. Use the mydomain url as an input parameter when using a sandbox (https://login.salesforce.com work on production - but https://test.salesforce does not work on sandboxes for JWT login)
2. Create a connected app with oauth enabled + digital signature (you can use the attached domain.crt and domain.key for testing)
3. Move the domain.key into a directory where it can be found (update the path in the code)
4. Update the client id / secret (to match your new connected app)
5. Use an administrator account to initially authenticate to the org (I gave it alias p1)
6. see below for yarn commands (I think yarn run build will do it)
7. On every execution it will check for the 3 output files:

- CloneListViewResult.csv
- CloneListViewResult.log
- CloneListViewRetry.csv
  If the file exists it will append \_0,\_1,\_2 etc. to the filename

Clone:listview
CSV Input : [username]/t[sobjecttype]/t[listviewid]/t[name_for_cloned_listview]
CSV Output : [username]/t[sobjecttype]/t[listviewid]/t[name_for_cloned_listview]/t[status]/t[timestamp]
Retry Ouput : [username]/t[sobjecttype]/t[listviewid]/t[name_for_cloned_listview]/t[status]/t[timestamp]
Error Ouput: Screenshot for every listview: <LV*ERROR*[userid]\*[listviewid].png>

To implement a retry loop use this (bash):

#!/bin/bash
INPUTCSV=“/input/CloneListView.csv”
while :
do
RESULT=$(sf clone:listview <bunch of other parameters> --json | jq ‘.result’)
INPUTCSV=$(echo $RESULT | jq ‘.path’)
READY=$(echo $RESULT | jq ‘.done’)
if [ $READY ]
then
break
fi
done

Note: Salesforce ID's: USE 18 Character ID Format

query the organization and display details
For every unique userid on csv
query the userid from User (needed for authentication)
Authenticate as that user
Retrieve existing listviews for that user (createbyid = userid)
If listview name already exist -> Skip
Else Navigate to listview + clone + assign clone name + save
Any errors recorded on <csv_input_file>.log

NOTE:

- This function checks if the cloned name already exists - if it does then the output CSV will have a status: OK- Duplicate
- It works best if the new listviews that are loaded and shared via public group have a prefix or suffix (i.e. CGT\_ or \_CGT). The duplicate names check helps to prevent mishaps (i.e. when running multiple times)

BELOW FOR REFERENCE ONLY
Extract:listview

connects to the org
sets a specific sobject type (i.e. ACCL_Promotion\_\_c or Account)
It runs for only 1 sobject type - if you need more then execute multiple times (after updating object type)
Reads the available list view on specified object type for the admininstrator (this will become the list of shared listviews)
Read the user object (use a where clause to filter on users that have a sales_org set)

Itterate over the users:
Login the org again with the user and retrieve the listviews
match the list views with the list from the administrator (if it matches then it is NOT a private list view)
Use a playwright script to clone the listview as a shared report
Set the API name to CGT + original Id + User Id
Sets the sharedTo on the newly shared Listview using metadata API (note that this currently fails because it is too quick - this should be moved to a new command and executed separately)
Create an entry for the package.xml

store the package.xml

Old Version:

Code to extract private listviews and convert this to xml

What does this do:
connects to the org
sets a specific sobject type (i.e. ACCL_Promotion\_\_c or Account)
It runs for only 1 sobject type - if you need more then execute multiple times (after updating object type)
Reads the available list view on specified object type for the admininstrator (this will become the list of shared listviews)
Read the user object (use a where clause to filter on users that have a sales_org set)
Itterate over the users:
Login the org again with the user and retrieve the listviews
match the list views with the list from the administrator (if it matches then it is NOT a private list view)
retrieve the describe of the listview
convert this into a new json structure
convert this into a new xml (columns, filter and some other attributes)
write to disk with the correct filename and directory path

Enjoy!

to do

- create a public group per user
- share the corresponding listview with the user
- additional logic to remove some of the columns on the xml
- additional logic to handle more complex filters and filter logic

[![NPM](https://img.shields.io/npm/v/listview.svg?label=listview)](https://www.npmjs.com/package/listview) [![Downloads/week](https://img.shields.io/npm/dw/listview.svg)](https://npmjs.org/package/listview) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/listview/main/LICENSE.txt)

## Using the template

This repository provides a template for creating a plugin for the Salesforce CLI. To convert this template to a working plugin:

1. Please get in touch with the Platform CLI team. We want to help you develop your plugin.
2. Generate your plugin:

   ```
   sf plugins install dev
   sf dev generate plugin

   git init -b main
   git add . && git commit -m "chore: initial commit"
   ```

3. Create your plugin's repo in the salesforcecli github org
4. When you're ready, replace the contents of this README with the information you want.

## Learn about `sf` plugins

Salesforce CLI plugins are based on the [oclif plugin framework](<(https://oclif.io/docs/introduction.html)>). Read the [plugin developer guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm) to learn about Salesforce CLI plugin development.

This repository contains a lot of additional scripts and tools to help with general Salesforce node development and enforce coding standards. You should familiarize yourself with some of the [node developer packages](#tooling) used by Salesforce.

Additionally, there are some additional tests that the Salesforce CLI will enforce if this plugin is ever bundled with the CLI. These test are included by default under the `posttest` script and it is required to keep these tests active in your plugin if you plan to have it bundled.

### Tooling

- [@salesforce/core](https://github.com/forcedotcom/sfdx-core)
- [@salesforce/kit](https://github.com/forcedotcom/kit)
- [@salesforce/sf-plugins-core](https://github.com/salesforcecli/sf-plugins-core)
- [@salesforce/ts-types](https://github.com/forcedotcom/ts-types)
- [@salesforce/ts-sinon](https://github.com/forcedotcom/ts-sinon)
- [@salesforce/dev-config](https://github.com/forcedotcom/dev-config)
- [@salesforce/dev-scripts](https://github.com/forcedotcom/dev-scripts)

### Hooks

For cross clouds commands, e.g. `sf env list`, we utilize [oclif hooks](https://oclif.io/docs/hooks) to get the relevant information from installed plugins.

This plugin includes sample hooks in the [src/hooks directory](src/hooks). You'll just need to add the appropriate logic. You can also delete any of the hooks if they aren't required for your plugin.

# Everything past here is only a suggestion as to what should be in your specific plugin's description

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Install

```bash
sf plugins install listview@x.y.z
```

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of
   what you are trying to add/fix. That way, we can also offer suggestions or
   let you know if there is already an effort in progress.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork. Note, this step is recommended but technically not required if contributing using a fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code. No pull request will be accepted without unit tests.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done. We'll review your code, suggest any needed changes, and merge it in.

### CLA

External contributors will be required to sign a Contributor's License
Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

To build the plugin locally, make sure to have yarn installed and run the following commands:

```bash
# Clone the repository
git clone git@github.com:salesforcecli/listview

# Install the dependencies and compile
yarn && yarn build
```

To use your plugin, run using the local `./bin/dev` or `./bin/dev.cmd` file.

```bash
# Run using local run file.
./bin/dev hello world
```

There should be no differences when running via the Salesforce CLI or using the local run file. However, it can be useful to link the plugin to do some additional testing or run your commands from anywhere on your machine.

```bash
# Link your plugin to the sf cli
sf plugins link .
# To verify
sf plugins
```

## Commands

<!-- commands -->

- [`sf hello world`](#sf-hello-world)

## `sf hello world`

Say hello either to the world or someone you know.

```
USAGE
  $ sf hello world [--json] [-n <value>]

FLAGS
  -n, --name=<value>  [default: World] The name of the person you'd like to say hello to.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Say hello either to the world or someone you know.

  Say hello either to the world or someone you know.

EXAMPLES
  Say hello to the world:

    $ sf hello world

  Say hello to someone you know:

    $ sf hello world --name Astro
```

<!-- commandsstop -->
