const core = require('@actions/core')
const github = require('@actions/github')
const authAction = require('@octokit/auth-action')
const semver = require('semver')

async function run() {
  const level = core.getInput('level')
  core.info(`Updating version with level "${level}"`)

  // Generate minor version from date
  const d = new Date()
  const year = String(d.getUTCFullYear()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const minorVersion = Number(`${year}${month}${day}`)

  // Get authenticated Octokit client
  const actionAuth = authAction.createActionAuth()
  const auth = await actionAuth()
  const octokit = github.getOctokit(auth.token)

  // Get existing tags and create a new tag ensuring we don't conflict
  const tags = await octokit.rest.repos
    .listTags({
      ...github.context.repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    .then((tags) => tags.data.map((tag) => tag.name).filter((tag) => Boolean(semver.valid(tag))))
  const currentVersionStr = semver.sort(tags).at(-1) ?? 'v0.0.0'
  const currentVersion = semver.parse(currentVersionStr)
  core.info(`Found latest version: ${currentVersionStr}`)

  const major = currentVersion.major + Number(level === 'major')
  const minor = minorVersion
  const patch = level !== 'major' && currentVersion.minor === minorVersion ? currentVersion.patch + 1 : 0
  const newVersionParts = [major, minor, patch]
  const newVersion = `v${newVersionParts.join('.')}`

  // Commit the tag to the repo
  const newTag = await octokit.rest.git.createTag({
    ...github.context.repo,
    tag: newVersion,
    message: `Version ${newVersion}`,
    object: process.env.GITHUB_SHA,
    type: 'commit',
  })
  await octokit.rest.git.createRef({
    ...github.context.repo,
    ref: `refs/tags/${newTag.data.tag}`,
    sha: newTag.data.sha,
  })
  core.info(`Tag "${newVersion}" created on commit SHA "${process.env.GITHUB_SHA}"`)
  core.notice(`New version: ${newVersion}`)

  core.setOutput('version', newVersion)
  core.setOutput('major', major)
  core.setOutput('minor', minor)
  core.setOutput('patch', patch)
}

run().catch((err) => core.setFailed(err.message))
