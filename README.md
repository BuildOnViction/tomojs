
## Install
Easy to install the package with command (It requires NodeJS 8+):
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
You need to init enviroment or create `.env` file to setup `ENDPOINT` and `USER_PKEY` before using the tool.

```
./tomo-cli init
```
Or:

```
cp .env.example .env
```

Help:
```
$ ./tomo-cli -h
Usage: tomo-cli [options] [command]

TomoChain CLI

Options:
  -V, --version                           output the version number
  -C --config <path>                      set config path. defaults to $HOME/.tomojs
  -h, --help                              output usage information

Commands:
  init [options]                          setup/init environment
  info                                    show environment
  stake [options]                         stake TOMO to a masternode candidate
  unstake [options]                       unstake TOMO from a masternode candidate
  propose [options]                       propose a new masternode candidate
  resign [options]                        resign a masternode candidate
  get-withdraw-blocknumbers               show blocknumbers to withdraw TOMO after unstake/resign
  withdraw [options]                      withdraw TOMO with specify Blocknumber after unstake/resign
  withdraw-all                            withdraw all available TOMO after unstake/resign
  get-balance [options]                   get user balance
  get-candidate-status [options]          get candidate status
  send [options]                          send TOMO to another account
  random-wallet                           generate a random wallet
  relayer-register [options]              resigter a relayer
  relayer-update [options]                update a relayer
  relayer-list-token [options]            list a new pair
  relayer-delist-token [options]          delist a pair
  relayer-resign [options]                resign a relayer
  relayer-deposit [options]               deposit to relayer
  transfer-relayer [options]              transfer a relayer to new owner
  relayer-withdraw [options]              withdraw TOMO after 30 days of resigning a relayer
  relayer-get [options]                   get relayer by coinbase address
  relayer-list                            list relayers
  relayer-lending-update [options]        add/update tomox lending pairs
  relayer-set-collateral-price [options]  set collateral price
  relayer-add-ilo-collateral [options]    add a ILO collateral
  relayer-get-collateral [options]        get collateral detail
  issuer-token [options]                  issue token
  issuer-update-fee [options]             update token transfer fee
  issuer-deposit-fee [options]            deposit token pooling fee
  issuer-apply-tomoz [options]            deposit token pooling fee
  issuer-apply-tomox [options]            deposit token pooling fee
  issuer-tomoz-tokens                     get tokens that applied to tomoz
  issuer-tomox-tokens                     get tokens that applied to tomoz
  issuer-check-apply-tomoz [options]      get tokens that applied to tomoz
  issuer-check-apply-tomox [options]      get tokens that applied to tomox
  issuer-reissue-token [options]          reissue a token
  issuer-burn-token [options]             reissue a token
  token-balance-of [options]              get token balance
  token-info [options]                    get token information
```
