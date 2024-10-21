# GitHub Action: knip-reporter

> ⚙️📄 Report the results from [knip](https://github.com/webpro/knip) on pull requests.

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/codex-/knip-reporter/ci.yml?style=flat-square)](https://github.com/Codex-/knip-reporter/actions/workflows/ci.yml) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-knip–reporter-blue?style=flat-square&logo=github&link=https%3A%2F%2Fgithub.com%2Fmarketplace%2Factions%2Fawait-remote-run)](https://github.com/marketplace/actions/knip-reporter)

This action runs [knip](https://github.com/webpro/knip), parses the results, and posts the report as comments on the related pull request.

## Usage

The execution of `knip` requires you to have followed the general `knip` setup and have a command script present in your `package.json` file, `knip`, by default but this can be of any name. If this script name deviates from the standard `knip` setup, please provide the script name in the config.

`knip-reporter` appends a reporter to the `knip` command used, `--reporter json`, to output a parseable report with information needed for annotations where supported.

```yaml
name: Pull Request
on:
  pull_request:

# This permissions config is only required if you are
# not providing own permissive token
permissions:
  checks: write
  issues: write
  pull-requests: write

steps:
  - name: Post the knip results
    uses: codex-/knip-reporter@v2
```

## Config

The following inputs are supported

| Input                 | Description                                                                  | Required | Default                                |
| --------------------- | ---------------------------------------------------------------------------- | -------- | -------------------------------------- |
| `token`               | GitHub Personal Access Token for making API requests.                        | `false`  | `${{ github.token }}`                  |
| `command_script_name` | The package script that runs knip.                                           | `false`  | `knip`                                 |
| `comment_id`          | ID to use when updating the PR comment. Spaces will be replaced with dashes. | `false`  | `${{ github.workflow }}-knip-reporter` |
| `annotations`         | Annotate the project code with the knip results.                             | `false`  | `true`                                 |
| `verbose`             | Include annotated items in the comment report.                               | `false`  | `false`                                |
| `ignore_results`      | Do not fail the action run if knip results are found.                        | `false`  | `false`                                |
| `working_directory`   | Run knip in a different directory.                                           | `false`  | `.`                                    |

### Issues

If you encounter a case where comments are not being posted, or known sections are missing from the report, please [enable step debug logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging#enabling-step-debug-logging) and create an issue with the results and expected behaviour.

### APIs Used

- `Checks`
  - `Check Runs`
    - [`Create a check run`](https://docs.github.com/en/rest/checks/runs#create-a-check-run)
      - POST `/repos/{owner}/{repo}/check-runs`
    - [`Update a check run`](https://docs.github.com/en/rest/checks/runs#update-a-check-run)
      - PATCH `/repos/{owner}/{repo}/check-runs/{check_run_id}`
- `Issues`
  - `Comments`
    - [`Create an issue comment`](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)
      - POST `/repos/{owner}/{repo}/issues/{issue_number}/comments`
    - [`List issue comments`](https://docs.github.com/en/rest/issues/comments#list-issue-comments)
      - GET `/repos/{owner}/{repo}/issues/{issue_number}/comments`
    - [`Update an issue comment`](https://docs.github.com/en/rest/issues/comments#update-an-issue-comment)
      - PATCH `/repos/{owner}/{repo}/issues/comments/{comment_id}`
    - [`Delete an issue comment`](https://docs.github.com/en/rest/issues/comments#delete-an-issue-comment)
      - DELETE `/repos/{owner}/{repo}/issues/comments/{comment_id}`
