const fs = require('fs');
const child_process = require('child_process');
const _ = require('lodash');
const async = require('async');
const httpProxy = require('node-http-proxy');
const mkdirp = require('mkdirp');

const CSUtils = require('containership.utils');

const Api = require('containership.api-factory');

const templates = require('./templates'); 

const baseConfigPath = '/etc/nginx';

const coreConfigPath = `/etc/nginx.conf`;
const configPaths = {
    http: `${baseConfigPath}/http.d`,
    https: `${baseConfigPath}/https.d`,
    tcp: `${baseConfigPath}/tcp.d`
};

const mkdir = _.partialRight(mkdirp, _.identity);
_.each(configPaths, (v, k) => {
    mkdir(v);
});

const api = new Api.Constructor('localhost', Api.DEFAULT_PORT);
const LOAD_BALANCERS_KEY = 'containership-cloud::loadbalancers';

const ifSuccessfulResponse = CSUtils.ifAcceptableResponseFn((err, res) => {
    console.log("There was an error: " + JSON.stringify(err) + " with body: " + JSON.stringify(res && res.body ? res.body: "NO BODY"));
});


function getLoadBalancers(cb) {
    api.getDistributedKey(LOAD_BALANCERS_KEY, ifSuccessfulResponse(cb));
}

function getApplications(cb) {
    api.getApplications(cb);
}

function startNginx() {
    const proc = child_process.spawn('nginx', ["-c", coreConfigPath]);

    console.log("Starting nginx process.");

    proc.stdout.write('Starting nginx process.');
    proc.stdout.on('data', proc.stdout.write);
    proc.stderr.on('data', proc.stderr.write);

    return proc;
}

function stopNginx(proc) {
    console.log("Stopping nginx process.");
    proc.stdout.write('Stopping nginx process.');
    proc.kill();
}

function writeNginxConfig(cb) {
    getLoadBalancers((lbs) => {
        getApplications((apps) => {

            console.log("Have Load balancers: " + JSON.stringify(lbs));
            console.log("HAve apps: " + JSON.stringify(apps));

            const toBeWritten = _.map(lbs, (lb) => {
                const path = configPaths[lb.type];
                const template = templates[lb.type]; 
                const application = apps[lb.application];
                const filename = `${path}/${lb.application}_${lb.listen_port}.conf`;


                return [
                    filename, 
                    template.render({
                        application:  application,
                        loadbalancer: lb
                    })
                ];
            });

            console.log("Writing core config: " + coreConfigPath);
            fs.writeFileSync(coreConfigPath, templates.core.render({}));
            
            async.each(toBeWritten, (data, result) => {
                const [ filename, file ] = data;
                console.log("writing: " + filename);
                result(fs.writeFileSync(filename, file));
            }, cb);

        });
    });
}


let nginxProc;
setTimeout(() => {

    writeNginxConfig(() => {

        console.log("Config written - cycling.");

        /*
        if(nginxProc) {
            stopNginx(nginxProc);
        }
        */

        nginxProc = startNginx();

    });

}, 15000);

