import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as pathLib from 'path';

import {EventEmitter} from "events";

async function docker(method: 'GET'|'POST', path: string, body?: string): Promise<http.IncomingMessage> {
    const dockerHost = process.env.DOCKER_HOST || '';
    const dockerCertPath = process.env.DOCKER_CERT_PATH || '';

    return new Promise(
        (resolve, reject) => {
            path = path.replace(/\//, '');

            let request;

            if (dockerHost !== '') {
                console.log('Using docker host.');
                const caPath = pathLib.join(dockerCertPath, 'ca.pem');
                const certPath = pathLib.join(dockerCertPath, 'cert.pem');
                const keyPath = pathLib.join(dockerCertPath, 'key.pem');

                request = https.request(
                    `${dockerHost.replace(/^tcp:/, 'https:')}/${path}`,
                    {
                        method,
                        ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
                        cert: fs.existsSync(certPath) ? fs.readFileSync(certPath) : undefined,
                        key: fs.existsSync(keyPath) ? fs.readFileSync(keyPath) : undefined,
                    },
                    response => resolve(response)
                );

                console.log({
                    method,
                    ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
                    cert: fs.existsSync(certPath) ? fs.readFileSync(certPath) : undefined,

                });
            } else {
                console.log('using docker over socket');
                request = http.request(
                    `http://localhost/${path}`,
                    { method, socketPath: '/var/run/docker.sock' },
                    response => resolve(response)
                );
            }

            if (method === 'POST') {
                request.write(body);
            }

            request.end();
            request.on('error', e => reject(e));
        }
    );
}

function parse(response: http.IncomingMessage): Promise<any> {
    return new Promise(
        (resolve, reject) => {
            let body = '';
            response.on('data', c => body += c);
            response.on('end', () => resolve(JSON.parse(body)));
            response.on('error', e => reject(e));
        }
    );
}

export async function containers() {
    return parse(await docker('GET', '/containers/json'));
}
