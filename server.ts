import {IncomingMessage} from "http";

const docker = require('./docker');

docker.containers().then(
    (r: any) => {
        console.log(r);
    }
);
