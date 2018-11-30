# fbtc

This is an example of how to write a proof-of-stake Bitcoin sidechain.

This readme will walk you through depositing testnet Bitcoin into our running example sidechain.

Please, for the love of Satoshi, do **not** use this code to secure mainnet Bitcoin yet.

## Depositing Bitcoin

First, make sure you've got some testnet Bitcoin. Here's a [faucet](https://testnet-faucet.mempool.co/) where you can get some for free.

Install the `fbtc` command-line wallet:

```
$ npm install -g fbtc
```

```
$ fbtc

Usage: fbtc [command]

  Commands:
    
    balance                       Display your fbtc address and balance
    send      [address] [amount]  Send deposited coins to another address
    deposit                       Generate and display Bitcoin deposit address
    withdraw  [address] [amount]  Withdraw fbtc to a Bitcoin address
```

Now generate a Bitcoin deposit address.

This address is tied to your `fbtc` address; any Bitcoin sent to it will credit your `fbtc` address for the same amount:

```
$ fbtc deposit

Waiting for Bitcoin deposit to n4VQ5YdHf7hLQ2gWQYYrcxoE5B7nWuDFNF
```

This command won't exit right away. Leave it running. It is running a relayer to watch the Bitcoin blockchain for a deposit transaction. It will exit once your deposit succeeds.

Once this exits, check your `fbtc` balance:

```
$ fbtc balance

Your address: 4C2tiCHRkdnC1VAwGowvG2CTQr5kReJ3y
Your balance: 0.99999734
```

Now send 0.2 `fbtc` to your friend:

```
$ fbtc send JvP4JbpiWUUFgDVfX2f36wgi1wjDnVwzu 0.2
```

## Withdrawing Bitcoin

Withdraw your remaining `fbtc` to any Bitcoin address like this:

```
$ fbtc withdraw 0.79943158 mtXWDB6k5yC5v7TcwKZHB89SUp85yCKshy
```

Your `fbtc` will be destroyed, and you'll receive an equivalent amount of Bitcoin (minus fees).

That's it!

## Nomic is hiring

JavaScript hacker interested in rearchitecting the way humans organize themselves? Please get in touch.
