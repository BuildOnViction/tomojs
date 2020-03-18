
## Install
It requires NodeJS 8+.

Easy to install the package with command:
```
npm install --save tomojs
```

Or you can use `tomo-cli` binary:
```
cd /tmp && wget https://github.com/tomochain/tomojs/releases/download/[VERSION]/tomo-cli.[VERSION].linux-x64 -O tomo-cli
chmod +x tomo-cli && sudo mv tomo-cli /usr/local/bin/
```
[Download Latest](https://github.com/tomochain/tomojs/releases/latest)

## Command Line
You need to create `.env` file to setup `ENDPOINT` and `USER_PKEY` before using the tool.

```
./tomo-cli init
```
Or:

```
cp .env.example .env
```

Help:
```
./tomo-cli --help
Usage: posv [options] [command]

TomoChain CLI

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
