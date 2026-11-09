/* Q9FN read-only diagnostics. ES5 syntax for Node 4.4.
 * No child processes, filesystem writes, settings changes, or outbound network.
 * One report on TV loopback port 18082; closes after retrieval or 120 seconds.
 * Start only through a reviewed TizenBrew service-loading route.
 */
(function () {
    'use strict';
    var fs = require('fs');
    var os = require('os');
    var http = require('http');
    if (typeof tizen === 'undefined' || process.platform !== 'linux') {
        throw new Error('This diagnostic is intended only for a Tizen TV service.');
    }
    var report = {schema: 1, purpose: 'Q9FN alternative prerequisite inventory; no root attempt', errors: []};
    function attempt(label, fn) {
        try { return fn(); }
        catch (e) { report.errors.push({field: label, code: e.code || e.name}); return null; }
    }
    function readSmall(path) {
        return attempt(path, function () {
            var fd = fs.openSync(path, 'r');
            try {
                var b = new Buffer(16384);
                var n = fs.readSync(fd, b, 0, b.length, 0);
                return b.toString('utf8', 0, n).trim();
            } finally { fs.closeSync(fd); }
        });
    }
    function listing(path, pattern) {
        return attempt(path, function () {
            return fs.readdirSync(path).filter(function (name) { return pattern.test(name); }).slice(0, 100);
        });
    }
    function stat(path) {
        return attempt(path, function () {
            var s = fs.statSync(path);
            return {path: path, mode: (s.mode & 4095).toString(8), uid: s.uid, gid: s.gid,
                file: s.isFile(), directory: s.isDirectory(), size: s.size};
        });
    }
    report.process = {
        uid: attempt('uid', function () { return process.getuid(); }),
        euid: attempt('euid', function () { return process.geteuid(); }),
        gid: attempt('gid', function () { return process.getgid(); }),
        groups: attempt('groups', function () { return process.getgroups(); }),
        architecture: process.arch, platform: process.platform,
        versions: process.versions
    };
    report.os = {
        type: attempt('os.type', function () { return os.type(); }),
        release: attempt('os.release', function () { return os.release(); }),
        architecture: attempt('os.arch', function () { return os.arch(); }),
        osRelease: readSmall('/etc/os-release'), kernelVersion: readSmall('/proc/version'),
        securityLabel: readSmall('/proc/self/attr/current')
    };
    var status = readSmall('/proc/self/status');
    report.processStatus = status === null ? null : status.split('\n').filter(function (line) {
        return /^(Name|Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs|Seccomp):/.test(line);
    });
    report.tizenVersion = attempt('tizenVersion', function () {
        return tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');
    });
    report.programs = ['/bin/sh', '/bin/bash', '/bin/tar', '/usr/bin/tar', '/usr/bin/dotnet',
        '/usr/bin/dotnet-launcher', '/usr/bin/node', '/usr/bin/nodejs', '/usr/bin/getcap',
        '/usr/bin/unshare'].map(stat);
    report.runtimeDirectories = {};
    ['/usr/share', '/usr/lib', '/opt/usr', '/usr/share/dotnet', '/usr/lib/dotnet',
        '/usr/share/dotnet.tizen', '/usr/share/dotnet.tizen/netcoreapp',
        '/usr/share/dotnet/shared/Microsoft.NETCore.App'].forEach(function (path) {
        var pattern = /./;
        if (path === '/usr/share' || path === '/usr/lib' || path === '/opt/usr') {
            pattern = /dotnet|netcore|coreclr|node|archive/i;
        }
        report.runtimeDirectories[path] = listing(path, pattern);
    });
    report.limits = [
        'File capabilities are not measured by stat; process capabilities describe only this service.',
        'No namespace creation or root attempt; directory names do not prove runtime usability.',
        'No environment, serial numbers, certificates, account files or application databases read.'
    ];
    // Metadata only for device nodes: never open, mmap or ioctl them.
    report.alternativePrerequisites = {
        filesystems: readSmall('/proc/filesystems'),
        loadedModules: readSmall('/proc/modules'),
        deviceNodes: ['/dev/ntksys', '/dev/fdet', '/dev/mali0', '/dev/video30',
            '/dev/video40', '/dev/video60', '/dev/tzmem'].map(stat),
        capabilityUtilities: ['/bin/getcap', '/sbin/getcap', '/usr/sbin/getcap',
            '/bin/getfattr', '/usr/bin/getfattr', '/usr/sbin/sdbd-tarlauncher'].map(stat),
        moduleRoots: {},
        exfatArtifacts: []
    };
    var crypto = require('crypto');
    var visited = 0;
    var inspected = 0;
    function inspectModules(path, depth) {
        if (visited >= 160 || depth > 3) return;
        visited++;
        var names = attempt(path, function () { return fs.readdirSync(path); });
        if (!names) return;
        if (depth === 0) report.alternativePrerequisites.moduleRoots[path] = names.slice(0, 100);
        names.slice(0, 250).forEach(function (name) {
            if (inspected++ >= 1500) return;
            var full = path + '/' + name;
            var info = attempt(full, function () { return fs.lstatSync(full); });
            if (!info) return;
            if (info.isDirectory()) { inspectModules(full, depth + 1); return; }
            if (!info.isFile() || !/exfat.*\.ko$/i.test(name)) return;
            var item = {path: full, size: info.size};
            if (info.size <= 2097152) {
                var bytes = attempt(full + ':bytes', function () { return fs.readFileSync(full); });
                if (bytes) {
                    item.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
                    item.base64 = bytes.toString('base64');
                }
            }
            report.alternativePrerequisites.exfatArtifacts.push(item);
        });
    }
    ['/lib/modules', '/usr/lib/modules'].forEach(function (path) { inspectModules(path, 0); });
    var deadline;
    var server = http.createServer(function (req, res) {
        if (req.method !== 'GET' || req.url !== '/report') {
            res.writeHead(404); res.end(); return;
        }
        res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
        res.end(JSON.stringify(report, null, 2));
        clearTimeout(deadline);
        server.close();
    });
    server.on('error', function (e) {
        clearTimeout(deadline);
        console.log('Q9FN_DIAG_ERROR ' + (e.code || e.name));
    });
    server.listen(18082, '127.0.0.1', function () {
        console.log('Q9FN_DIAG_READY /report');
    });
    deadline = setTimeout(function () { server.close(); }, 120000);
}());
