
## Install
It requires NodeJS 8+.

Easy to install the package with command:
```
npm install --save posvjs
```

Or you can use `posv` binary:
```
cd /tmp && wget https://github.com/tomochain/posvjs/releases/download/[VERSION]/posv.[VERSION].linux-x64 -O posv
chmod +x posv && sudo mv posv /usr/local/bin/
```

## Command Line
You need to create `.env` file to setup `ENDPOINT` and `STAKER_PKEY` before using the tool.

```
./posv init
```
Or:

```
cp .env.example .env
```

### Stake
### UnStake
### Resign
### Withdraw
