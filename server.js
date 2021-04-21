const containers = require('./containers');
const dns2 = require('dns2');
const { Packet } = dns2;
const dns = require('dns');

const externalResolver = new dns2({ nameServers: dns.getServers() });
const internalResolver = new dns2({ nameServers: ['192.168.65.5'] });

const udpServer = dns2.createUDPServer(
    async (request, send, rinfo) => {
        const started = Date.now();
        const [question] = request.questions;
        const response = dns2.Packet.createResponseFromRequest(request);
        const domain = question.name;
        const typeName = Object.keys(dns2.Packet.TYPE).filter(k => dns2.Packet.TYPE[k] === question.type)[0];

        // Use the internal resolver if the domain ends in '.internal'.
        if (/\.internal$/.test(domain)) {
            response.answers.push({
                name: domain,
                type: dns2.Packet.TYPE.A,
                class: dns2.Packet.CLASS.IN,
                ttl: 5,
                address: {
                    'vm.docker.internal': '192.168.64.2',
                    'host.docker.internal': '192.168.64.1',
                    'http.docker.internal': '192.168.64.2',
                }[domain],
            });
            // response.answers = (await internalResolver.resolve(domain, typeName)).answers;
        }

        // If the domain doesn't end in .docker, then assume it is looked up externally.
        else if (!/\.docker$/.test(domain)) {
            response.answers = (await externalResolver.resolve(domain, typeName)).answers;
        }

        // Otherwise, look it up against running containers.
        else {
            const strippedDomain = domain.replace(/\.docker$/, '');
            const address = (await containers.all())[strippedDomain];

            if (address && question.type === dns2.Packet.TYPE.A) {
                response.answers.push({
                    name: domain,
                    type: dns2.Packet.TYPE.A,
                    class: dns2.Packet.CLASS.IN,
                    ttl: 5,
                    address,
                });
            }
        }

        console.log(`[${typeName.padStart(4, ' ')}] [${(Date.now() - started).toLocaleString().padStart(5, ' ')}ms] ${domain} -> ${response.answers.map(a => a.address).join(', ')}`);

        send(response);
    }
);

udpServer.listen(15353).then(
    () => {
        console.log('server is running.');
    }
);
