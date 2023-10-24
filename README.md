# GitHub Action: knip-reporter

> ⚙️📄 Report the results from [knip](https://github.com/webpro/knip) on pull requests.

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/codex-/knip-reporter/ci.yml?style=flat-square)](https://github.com/Codex-/knip-reporter/actions/workflows/ci.yml) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-knip-reporter-blue.svg?colorA=24292e&colorB=0366d6&style=flat-square&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/knip-reporter)

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
