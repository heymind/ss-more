#!/usr/bin/env node
'use strict';

const args = require('args');
const fs = require('fs');

const yaml = require('js-yaml');
const exec = require('child_process').exec;

const hasbin = require('hasbin');

let configFile;
let config;
const defaultConfig = {
    "shadowsocks": {
        "enable": false,
        "local_addr": "127.0.0.1",
        "local_port": 1080,
        "timeout": 600,
        "hosts": [],
        "current": 0
    },
    "privoxy": {
        "enable": true,
        "listen_addr": "0:8081",
        "socks5_forward_addr": "localhost:1080"
    },
    "proxychains": {
        "remote_dns": true
    }
};

function getConfigFile() {
    const {
        XDG_CONFIG_HOME,
        HOME
    } = process.env;
    return (XDG_CONFIG_HOME || `${HOME}/.config`) + '/ss-more.yml';
}

function createConfigFile(url, data = defaultConfig) {
    return fs.writeFileSync(url, yaml.safeDump(data));
}

function parseSSUrl(url) {
    const regex = /ss:\/\/(.*)?:(.*)@(.*):(.*)/
    const result = regex.exec(url);
    if (!result) throw new Error(`${url} is not a vaild ss url.`);
    return result.slice(1);
}

function startSSlocal() {
    if (!config.shadowsocks.enable) throw new Error('ss-local is disable.');
    if (!hasbin.sync('ss-local')) throw new Error('ss-local binary is not found.');
    const current = config.shadowsocks.current;
    const [method, password, host, port] = parseSSUrl(config.shadowsocks.hosts[
        current]);
    const {
        timeout,
        local_addr,
        local_port
    } = config.shadowsocks;
    console.log(`starting ss-local ...${host}:${port}`);
    console.log(
        `ss-local -s ${host} -p ${port} -k ${password} -m ${method} -t ${timeout} -b ${local_addr} -l ${local_port} &`
    );
    const info = exec(
        `ss-local -s ${host} -p ${port} -k ${password} -m ${method} -t ${timeout} -b ${local_addr} -l ${local_port} &`
    );
}

function startPrivoxy() {
    if (!config.privoxy.enable) throw new Error('privoxy is disable.');
    if (!hasbin.sync('privoxy')) throw new Error('privoxy binary is not found.');
    const tempfile = `/tmp/privoxyConfig_${(Math.random() * 1000).toString()}`
    const {
        listen_addr,
        socks5_forward_addr
    } = config.privoxy
    fs.writeFileSync(tempfile,
        `listen-address    ${listen_addr}
    forward-socks5    /    ${socks5_forward_addr} .
    `
    );
    exec(`privoxy ${tempfile}`);
}

function writeProxychainsConfig() {
    let path = `${process.env.HOME}/.proxychains`
    if (!fs.existsSync(path)) fs.mkdir(path);
    path += 'proxychains.conf'
    fs.writeFileSync(path,
        `listen-address    ${listen_addr}
    forward-socks5    /    ${socks5_forward_addr} .
    `
    );
}

function showSSHosts() {
    let i = 0;
    for (let url of config.shadowsocks.hosts) {
        console.log(
            `[${i == config.shadowsocks.current ? '*' : ' '}${i++}] ${url}`
        );
    }
}

function switchSShost(n) {
    if (n < config.shadowsocks.hosts.length) {
        config.shadowsocks.current = n;
        createConfigFile(configFile, config);
    } else {
        throw new Error('Index out of range.');
    }
    showSSHosts();
    stop('shadowsocks');
    start('shadowsocks');
}

function start(service) {
    switch (service) {
    case 'all':
        startSSlocal();
        startPrivoxy();
        break;
    case 'shadowsocks':
        startSSlocal();
        break;
    case 'privoxy':
        startPrivoxy();
        break;
    default:
        throw new Error('service not found.');

    }
}

function stop(service) {
    switch (service) {
    case 'all':
        exec('pkill ss-local');
        exec('pkill privoxy');
        break;
    case 'shadowsocks':
        console.log('bad impl....(pkill ss-local)');
        exec('pkill ss-local');
        break;
    case 'privoxy':
        console.log('bad impl....(pkill privoxy)');
        exec('pkill privoxy');
        break;
    default:
        throw new Error('service not found.');

    }

}
configFile = getConfigFile();
if (fs.existsSync(configFile)) {
    config = Object.assign(defaultConfig, yaml.safeLoad(fs.readFileSync(
        configFile)));
} else {
    createConfigFile(configFile);
    console.log(`config file has been created. ${configFile}`);
    config = defaultConfig;
}

args.command('start', 'start a service [shadowsocks,privoxy,all]', (name, params) => start(params[0]))
    .command('stop', 'stop a service(bad impl)', (name, params) => stop(params[
        0]))
    .command('restart', '', (name, params) => {
        stop(params[0]);
        start(params[0]);
    })
    .command('list', 'list shadowsocks hosts', () => showSSHosts())
    .command('switch', 'switch [which] ,use list command to get id..', (name,
        params) => switchSShost(parseInt(params[0])));
args.parse(process.argv);
process.exit(0);
