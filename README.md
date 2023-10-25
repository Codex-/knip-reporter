# GitHub Action: knip-reporter

> ⚙️📄 Report the results from [knip](https://github.com/webpro/knip) on pull requests.

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/codex-/knip-reporter/ci.yml?style=flat-square)](https://github.com/Codex-/knip-reporter/actions/workflows/ci.yml) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-knip–reporter-blue?style=flat-square&logo=github&link=https%3A%2F%2Fgithub.com%2Fmarketplace%2Factions%2Fawait-remote-run)](https://github.com/marketplace/actions/knip-reporter)

This action runs [knip](https://github.com/webpro/knip), parses the results, and posts the report as comments on the related pull request.

## Usage

```yaml
name: Pull Request
on:
  pull_request:

steps:
  - name: Post the knip results
    uses: codex-/knip-reporter@v1
```

## Config

The following inputs are supported

| Input                 | Description                                           | Required | Default                                |
| --------------------- | ----------------------------------------------------- | -------- | -------------------------------------- |
| `token`               | GitHub Personal Access Token for making API requests. | `false`  | `${{ github.token }}`                  |
| `command_script_name` | The package script that runs knip.                    | `false`  | `knip`                                 |
| `comment_id`          | ID to use when updating the PR comment.               | `false`  | `${{ github.workflow }}-knip-reporter` |
| `ignore_result`       | Do not fail the action run if knip results are found. | `false`  | `false`                                |

### Issues

If you encounter a case where comments are not being posted, or known sections are missing from the report, please [enable step debug logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging#enabling-step-debug-logging) and create an issue with the results and expected behaviour.

### APIs Used

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
