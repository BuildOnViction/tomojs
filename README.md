
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

Help:
```
./posv --help
Usage: posv [options] [command]

TomoChain POSV CLI

Options:
  -V, --version            output the version number
  -h, --help               output usage information

Commands:
  init [options]           setup/init environment
  info                     show environment
  stake [options]          stake TOMO to a masternode candidate
  unstake [options]        unstake TOMO from a masternode candidate
  propose [options]        propose a new masternode candidate
  resign [options]         resign a masternode candidate
  getWithdrawBlockNumbers  show blocknumbers to withdraw TOMO after unstake/resign
  withdraw [options]       withdraw TOMO with specify Blocknumber after unstake/resign
  withdrawAll              withdraw all available TOMO after unstake/resign
```
