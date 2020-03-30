const argv = require('minimist')(process.argv.slice(2));
const cp = require('child_process');
if (argv.help) {
    console.log("Just run me to view the file...");
} else {
    cp.execSync('cat /etc/my-private-file.txt', {stdio: 'inherit', uid: 0});
}
