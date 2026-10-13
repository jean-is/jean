import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { KEEP, parseTarget, releaseName, remote, unpublished } from '../scripts/deploy.js'

describe('deploy', () => {
  it('reads the server and its folder from DEPLOY_TO, as rsync writes them', () => {
    assert.deepEqual(parseTarget('myserver:/srv/jean'), { host: 'myserver', folder: '/srv/jean' })
    assert.deepEqual(parseTarget('me@example.org:/apps/jean/site/'), { host: 'me@example.org', folder: '/apps/jean/site' })
  })

  it('refuses a target it would have to quote: none, relative, the root, spaces, quotes or a host read as an option', () => {
    for (const target of [undefined, '', 'myserver', 'myserver:', 'myserver:srv/jean', 'myserver:/', 'my server:/srv', "myserver:/srv/it's", 'myserver:/srv/a b', '-oProxyCommand=x:/srv']) {
      assert.throws(() => parseTarget(target), /DEPLOY_TO/, String(target))
    }
  })

  it('names a release by its time in UTC, then its commit, so names sort by time', () => {
    assert.equal(releaseName(new Date('2026-10-13T20:31:43.512Z'), '88a08e7'), '20261013-203143-88a08e7')
    const names = [new Date('2026-12-01T09:00:00Z'), new Date('2026-10-13T20:31:43Z')].map((date) => releaseName(date, 'abc1234'))
    assert.deepEqual([...names].sort(), names.reverse())
  })

  it('starts a release as hard links to the current one, swaps current in one step and keeps the last ones', () => {
    const { prepare, publish } = remote('/srv/jean', '20261013-203143-88a08e7')
    assert.match(prepare, /cp -al '\/srv\/jean\/current\/' '\/srv\/jean\/releases\/20261013-203143-88a08e7'/)
    assert.match(prepare, /else mkdir '\/srv\/jean\/releases\/20261013-203143-88a08e7'/, 'the first release has nothing to start from')
    assert.match(publish, /ln -sfn 'releases\/20261013-203143-88a08e7' current\.new; mv -T current\.new current/)
    assert.match(publish, new RegExp(`head -n -${KEEP} \\| xargs -r rm -rf`))
    for (const command of [prepare, publish]) assert.match(command, /^set -e; /)
  })

  it('publishes the render package only when npm lacks the version the build names (D321)', () => {
    const listing = { render: { version: '0.8.0-r9e695e594201' } }
    assert.equal(unpublished(listing, ['0.0.0-stage', '0.8.0-re4c5b5a2bb10']), '0.8.0-r9e695e594201')
    assert.equal(unpublished(listing, []), '0.8.0-r9e695e594201', 'before its first version')
    assert.equal(unpublished(listing, ['0.8.0-re4c5b5a2bb10', '0.8.0-r9e695e594201']), null)
    assert.equal(unpublished({}, []), null, 'a build without a reader has no package')
  })
})
