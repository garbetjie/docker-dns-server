const lib = {
    http: require('http'),
    https: require('https'),
    fs: require('fs'),
    path: require('path'),
    url: require('url'),
};

// Determine the base URI for Docker requests.
let dockerBaseUri = 'http://localhost';

// Determine the Node lib to use to make the requests.
let dockerLib = 'http';

// Determine the base options for Docker requests.
let dockerOptions = { socketPath: '/var/run/docker.sock' };

// Running on Docker Machine.
if (process.env.hasOwnProperty('DOCKER_HOST')) {
    dockerLib = 'https';
    dockerBaseUri = process.env.DOCKER_HOST.replace(/^tcp:/, 'https:');

    // Remove some unnecessary options.
    delete dockerOptions["socketPath"];

    // If we have a path to certificates, then add them to the options.
    if (process.env.hasOwnProperty('DOCKER_CERT_PATH')) {
        const dockerCertPath = process.env.DOCKER_CERT_PATH;

        Object.entries({ ca: 'ca.pem', cert: 'cert.pem', key: 'key.pem' }).forEach(
            ([key, value]) => {
                const path = lib.path.join(dockerCertPath, value);

                if (lib.fs.existsSync(path)) {
                    dockerOptions[key] = lib.fs.readFileSync(path);
                }
            }
        )
    }
}

console.log(dockerBaseUri);
require('util').inspect(dockerOptions, { depth: 15, compact: false, showHidden: true });

/**
 *
 * @param {String} method
 * @param {String} path
 * @param {String|undefined} [body]
 *
 * @returns {Promise<Array|Object>}
 */
async function docker(method, path, body) {
    method = method.toUpperCase();
    path = path.replace(/\//, '');

    return new Promise(
        (resolve, reject) => {
            const request = lib[dockerLib].request(
                `${dockerBaseUri}/${path}`,
                { method, ...dockerOptions },
                response => {
                    let body = '';

                    response.on('data', c => body += c);
                    response.on('end', () => resolve(JSON.parse(body)));
                    response.on('error', e => reject(e));
                }
            );

            if (method === 'POST' || method === 'PUT') {
                request.write(body);
            }

            request.end();
            request.on('error', e => reject(e));
        }
    );
}

// The main promise that contains the list of containers.
let containerMap = mapContainers();

async function mapContainers() {
    /** @var {Container[]} */ const containers = await docker('GET', '/containers/json');
    const map = {};

    const addMap = (name, address) => {
        if (map.hasOwnProperty(name)) {
            console.warn(`Mapping container host name '${name}' that is already defined.`);
        }

        map[name] = address;
    };

    containers.forEach(
        container => {
            const fillMap = (address) => {
                // Add id.
                !map.hasOwnProperty(container.Id) && addMap(container.Id, address);

                // Add names.
                container.Names.forEach(name => !map.hasOwnProperty(name) && addMap(name.replace(/^\//, ""), address));
            };

            const labels = container.Labels || {};

            // Check for containers created by docker-compose, and add them as "${service}.${project}".
            if (labels.hasOwnProperty('com.docker.compose.project') && labels.hasOwnProperty('com.docker.compose.service')) {
                const service = labels['com.docker.compose.service'];
                const project = labels['com.docker.compose.project'];

                Object.keys(container.NetworkSettings.Networks).forEach(
                    /** @param {String} networkName */ networkName => {
                        if (networkName.indexOf(`${project}_`) !== 0) {
                            return;
                        }

                        const address = container.NetworkSettings.Networks[networkName].IPAddress;

                        addMap(`${service}.${project}`, address);
                    }
                )
            }

            // Check for any network aliases.
            Object.keys(container.NetworkSettings.Networks).forEach(
                networkName => {
                    const address = container.NetworkSettings.Networks[networkName].IPAddress;

                    // Ensure the container has an IP address for id & name.
                    fillMap(address);

                    // Ensure aliases are added.
                    (container.NetworkSettings.Networks[networkName].Aliases || []).forEach(
                        alias => {
                            addMap(`${alias}.${networkName}`, address);
                        }
                    );
                }
            );
        }
    );

    console.log(map);
    return map;
}

// Start periodic updates of containers.
!function updateContainers() {
    setTimeout(
        () => {
            containerMap = mapContainers().finally(() => updateContainers())
        },
        5000
    )
}();

module.exports = function() {
    return containerMap;
}

/**
 * @typedef Container
 * @type {Object}
 * @property {String} Id
 * @property {String[]} Names
 * @property {?Object<String, String>} Labels
 * @property {Object<String, { IPAddress: String, Aliases: String[] }>} NetworkSettings.Networks
 */
