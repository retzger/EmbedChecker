require('isomorphic-fetch');
require('dotenv').config();
const ecc = require('eosjs-ecc');

const createHash = require('create-hash');
const hash = x => createHash('sha256').update(x).digest('hex');

const INTERVAL = process.env.INTERVAL | 20000;
const PROOF_KEYS = (
	process.env.PROOF_KEYS ||
	'EOS57fs1Mi7RrMChZ9GsxsCYqG22y9PjnmCnakLMALuA8qM3qKcwG,EOS6LrPgvoncmV8azzm16s4cT3tawiZsTpkDZy7Yeivdqtppgronh,EOS88H35pzmYqi2AAeXbnYbXwCzZUkYRji9wmSncKvbYxMDBSU8PU,EOS8ic3RkEmn1KFsAFrHq2662fawiQasmxjN24XLHVV77S2odfBu4,EOS6b63XTiiuZ8YE7Yd5yqpTzsd9CqThV7M2Qn1DMPkPaiYwvo9e2,EOS6jreFpkGLNMMPpwkkJ2x8weNQozqUxEB8BoCanRCHaLnPM7i8X,EOS8gNGX6xPqo9qdWRWf3wi7ixCUetFZgWq43hNXfht2CdHWJ8NCz,EOS69ccoRaQ19ibtiSsyDVWsajfCQjXK3pGP53YUXaqfPeHWEaRwj,EOS6tpa7TJ5JCeDQrnFk6stZYhEHSw92nCkXzoZQ1pHDdukL6Eo2t,EOS7jpensVjpvKDLPmVa7JMuv6X8o6PxrthkqBMLP4zfpAYQkc8dm,EOS6bctfcYDzxo8HvngwxuPrepcTrcftnGLF31ebRiq8Ji2FyfUWi,EOS7BSUXLdoreHYusGpWiBmUJELkHaEDiQ7NR1HApbEgavKSC4nwJ,EOS6QgW56mNXTMKGiVyV68Qi5E4GBDVFF3fhP5sGR93Hmn5pCM4iA,EOS7R9PD5xMUSPCWXTzF4NoQD6ivCUFKHaix9P4DD5BsRzuMzsPff,EOS76KSWE2zQcuUWNLox3xVtQzJDSggusbvW7gTh9Fa9eXUqpC95y,EOS6jCUTQudKK8CiKxTiXPgrM61UAodxEDzmWG7AUy4SZxPApK8qh,EOS5pxccDZrjQJpJbjihKG9Dejjy2ejdcZSeUZ85ZRZ1dT5JBSZiP,EOS5Je9YXCGrrfqdB7k6trvKEaCfNFeJbGi2JhnRJyCnRNEKWD6Sm,EOS7CQMi5gu6BU99eyWoEmegevE2HVXXn6D422mnoTkdegh8JmkBN,EOS7KpdNqJCJg4eGksxqdvnrRpFRqkEph98vTJ5v7kDUuG6gcgjx5,EOS5repNL375YX1coUEv3bqeX5Q4YWspbCEvcrtgvTDFRydjYjs4C,EOS85VAaCWWSa8p68abyPyYzsHeiTCijSfDm5cGUyStEjcstSbSMw'
).split(',');

if(!PROOF_KEYS.length){
	console.error('No proof keys loaded');
	process.exit(0);
}

let serverIndex = 0;
let SERVERS = [];
let serverCount = 20;


const GITHUB_API_KEY = process.env.GITHUB_API_KEY;
if(!GITHUB_API_KEY) console.warn('Consider loading a GITHUB API KEY into the .env file');

let githubHeaders = {};
if(GITHUB_API_KEY) githubHeaders = { "Authorization":`token ${GITHUB_API_KEY}` };
const fetchFromGithub = () => {
	return fetch(`https://api.github.com/repos/GetScatter/ScatterEmbed/contents/dist?ref=production`, {
		method:"GET",
		cache: "no-cache",
		headers:githubHeaders
	}).then(x => x.json())
}

const getFilesList = async () => {
	let tree = await fetchFromGithub();
	if(!tree || tree.message) return console.error('BAD GITHUB TREE!', tree);

	tree = tree.filter(x => x.type === 'file')
		.filter(x => x.path.indexOf('.LICENSE') === -1)
		.map(x => {
			x.path = x.path.replace('dist/', '');
			return x;
		});

	return tree;
};

const checkSignature = async (hashed, signed) => {
	const recovered = ecc.recoverHash(signed.trim(), hashed.trim());
	let proven = false;
	for(let i = 0; i < PROOF_KEYS.length; i++){
		try {
			if(recovered === PROOF_KEYS[i]) {
				proven = true;
				break;
			}
		} catch(e){}
	}
	return proven;
}

const notifyScatterTeam = (server, filename) => {
	return fetch(`https://api.get-scatter.com/embed-notify`, {
		method:"POST",
		body:JSON.stringify({
			server,
			filename
		})
	}).catch(() => null)
};

(async() => {

	await Promise.all([...Array(serverCount).keys()].map(async i => {
		const ip = (await fetch('https://embed.get-scatter.com/hashes/embed.timestamp')).headers.get('server-ip');
		if(!SERVERS.includes(ip)) SERVERS.push(ip);
		return true;
	}));

	if(!SERVERS.length) return console.error('Error getting servers list', SERVERS);

	const files = await getFilesList();
	if(!files) return console.error('Error getting files list');

	console.group('Computing hashes from GitHub production branch.');
	await new Promise(r => setTimeout(() => r(true), 1000));

	let hashes = {};
	await Promise.all(files.map(async rawfile => {
		const file = await fetch(rawfile.download_url).then(x => x.text());
		hashes[rawfile.name] = hash(file);
		console.log('Hashed: ', rawfile.name, hashes[rawfile.name]);
		return true;
	}));

	console.log('Finished computing hashes.');
	console.groupEnd();

	console.log('--------------------------------------');
	console.log('Starting to check servers.');
	console.log('--------------------------------------');
	await new Promise(r => setTimeout(() => r(true), 1000));

	const checkServer = async () => {
		const server = SERVERS[serverIndex];
		serverIndex++;
		if(serverIndex > SERVERS.length-1) serverIndex = 0;

		console.group('Checking server: ', server)

		let error = false;
		let verified = 0;
		await Promise.all(Object.keys(hashes).map(async filename => {
			if(error) return;

			const [hashed,sig] = (await fetch(`http://${server}/hashes/${filename}.hash`).then(x => x.text())).split('|');

			if(hashed !== hashes[filename]) {
				notifyScatterTeam();
				error = true;
				console.error('CACHED HASH ERROR!', filename, 'Server hash: ', hashed, 'Calculated hash: ', hashes[filename]);
			}
			if(!checkSignature(hashed, sig)) {
				notifyScatterTeam();
				error = true;
				console.error('SIGNATURE ERROR!', filename, 'Signature', sig);
			}

			if(error) return;
			const file = (await fetch(`http://${server}/${filename}`).then(x => x.text()).catch(() => null));

			if(!file) {
				notifyScatterTeam();
				error = true;
				console.error('Error fetching file from server', server, filename);
			}

			if(hashes[filename] !== hash(file)){
				notifyScatterTeam();
				error = true;
				console.error('COMPUTED HASH ERROR!', filename, 'Server hash: ', hash(file), 'Calculated hash: ', hashes[filename]);
			}

			if(error) return;
			verified++;

			console.log(`File verified (${verified}/${Object.keys(hashes).length})`, filename);
		}));

		console.log(`Server verified! ${INTERVAL/1000} seconds until next server.`);
		if(error) return;
		console.groupEnd();
		await new Promise(r => setTimeout(() => r(true), INTERVAL));
		checkServer();
	};

	checkServer();


})();
