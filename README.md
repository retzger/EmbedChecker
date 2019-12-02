# Scatter Embed Checker

This script allows anyone to help make sure that Scatter Embed servers have verified files based
on production branches of the project.

#### Checking process
- Pull github tree and create an object of locally computed `{filename:hash}`
- Check hash and signature against `<server>/hashes/<filename>.hash`
- Pull file from `<server>/<filename>`, compute hash, and check against locally computed hash.

If all the above checks succeed for each file on the server, then the server is verified.
If at any point a file fails a hash or signature check this script will notify our API as well as
throw an error and exit.

**Caveat**: During a rolling upgrade, you might get false positives on failures. This happens when the
`production` branch of `ScatterEmbed` diverges from the live set of servers being hosted through the load balancer.
Once the tags change on the load balancer, the hashes will match again.

## Install

- `git clone https://github.com/GetScatter/EmbedChecker.git`
- `cd EmbedChecker`
- `yarn` or `npm install`
- copy `.env.example` to `.env`

_You can add a GitHub API key into the `.env` file if you are having issues with GitHub rejecting
file tree fetches._

## Run script
- `yarn start` or `npm start`
