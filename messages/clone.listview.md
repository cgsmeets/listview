# summary

Clone the listviews for a user and store as a private listview

# description

Use a CSV file as input. userid,sobjecttype,listviewid,name_for_cloned_listview.

# flags.name.summary

Client id of the connected app.

# flags.name.description

The connected app is used to generate a sessions for a user usng JWT.

# examples

- <%= config.bin %> <%= command.id %>

# flags.input-csv.summary

CSV Input file. userid,sobjecttype,listviewid,name_for_cloned_listview.

# flags.key-file.summary

Key for referenced connected app.

# flags.output-csv.summary

Output path for result csv and screenshot.

# flags.instance.summary

Instance URL.

# flags.instance.summary

Salesforce instance URL.

# flags.skip-duplicate.summary

When set to true duplicate listview names for an object will be skipped.
