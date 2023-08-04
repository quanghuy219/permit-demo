const targetNetworkId = "0x5";
const USDC_CONTRACT = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
const SPENDER = "0x62805A97AA27D7173545b1692d54a2DdDC3dE7C2";
const etherscanLink = "https://eth-goerli.blockscout.com/tx"
// const etherscanLink = "https://goerli.etherscan.io/tx"
let walletAddress;
let usdcAbi;
let swapAbi;

document.addEventListener('DOMContentLoaded', () => {
    var cleave = new Cleave('.number-input', {
        numeral: true,
        numeralThousandsGroupStyle: 'thousand',
        numeralDecimalScale: 18
    });
});

const tokens = {
    USDC: {
        name: "USD Coin",
        decimal: 6,
        address: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
        logo: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png?1547042389",
        erc20: true,
        isPermitSupported: true,
        native: false,
        version: "2"
    },
    ETH: {
        name: "ETH",
        decimal: 18,
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
        isPermitSupported: false,
        erc20: false,
        native: true
    }
}

async function connect() {
    let response = await fetch("./abi/usdc.json")
    usdcAbi = await response.json()

    let r = await fetch("./abi/swap.json")
    swapAbi = await r.json()

    if (window.ethereum) {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        window.web3 = new Web3(window.ethereum);
        const account = web3.eth.accounts;
        //Get the current MetaMask selected/active wallet
        walletAddress = account.givenProvider.selectedAddress;
        document.querySelector('#wallet-address-txt').textContent = `Wallet: ${walletAddress}`;
        if (!(await checkNetwork())) {
            await switchNetwork();
        }

        await onSourceTokenChange(document.querySelector("#select-source-token").value)
        await onDestTokenChange(document.querySelector("#select-dest-token").value)
    } else {
        alert("No wallet");
    }
}

async function checkNetwork() {
    if (window.ethereum) {
      const currentChainId = await window.ethereum.request({
        method: 'eth_chainId',
      });

      // return true if network id is the same
      if (currentChainId == targetNetworkId) return true;
      // return false is network id is different
      return false;
    }
}

async function switchNetwork() {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetNetworkId }],
    });
    // refresh
    window.location.reload();
}

const getBalance = async (token) => {
    if (token.native) {
        balance = await window.web3.eth.getBalance(walletAddress);
        return window.web3.utils.fromWei(balance)
    }

    const contract = new window.web3.eth.Contract(usdcAbi, token.address)
    result = await contract.methods.balanceOf(walletAddress).call()
    balance = new BigNumber(result)
    return balance.dividedBy(BigNumber(10).pow(token.decimal)).toFormat()
}

const onSourceTokenChange = async (value) => {
    const sourceToken = tokens[value]
    let balance = await getBalance(tokens[value]);
    document.querySelector('#source-token-balance-label').textContent = `Balance: ${balance}`;
    if (sourceToken.isPermitSupported) {
        document.querySelector("#swap-btn").value = "Permit and Swap"
    } else {
        document.querySelector("#swap-btn").value = "Swap"
    }
}

const onDestTokenChange = async (value) => {
    let balance = await getBalance(tokens[value]);
    document.querySelector('#dest-token-balance-label').textContent = `Balance: ${balance}`;
}

const switchTokens = async () => {
    const sourceTokenElement = document.querySelector("#select-source-token")
    const sourceTokenValue = sourceTokenElement.value
    const destTokenElement = document.querySelector("#select-dest-token")
    const destTokenValue = destTokenElement.value

    sourceTokenElement.value = destTokenValue
    destTokenElement.value = sourceTokenValue
    await onSourceTokenChange(sourceTokenElement.value)
    await onDestTokenChange(destTokenElement.value)
}

const inputMaxAmount = async () => {
    const sourceToken = document.querySelector("#select-source-token").value
    const token = tokens[sourceToken]
    balance = await getBalance(token)
    document.querySelector("#source-token-amount").value = balance
}

const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

const Permit = [
    {
      name: "owner",
      type: "address"
    },
    {
      name: "spender",
      type: "address"
    },
    {
      name: "value",
      type: "uint256"
    },
    {
      name: "nonce",
      type: "uint256"
    },
    {
      name: "deadline",
      type: "uint256"
    }
]

const createEIP2612TypedData = async function(domain, message) {
    const typedData = {
        types: {
            EIP712Domain,
            Permit,
        },
        primaryType: "Permit",
        domain,
        message
    }
    return typedData
}

const getNonce = async () => {
    const contract = new window.web3.eth.Contract(usdcAbi, USDC_CONTRACT)
    try {
        result = await contract.methods.nonces(walletAddress).call()
        return result
    } catch (err) {
        console.log(err)
    }
}

const signPermitMessage = async function(name, version, contract, value, chainId = 5) {
    const domain = {
        name,
        version,
        chainId,
        verifyingContract: contract
    }
    let walletNonce = await getNonce()
    let deadline = Math.floor(new Date().getTime() / 1000) + 1800
    const message = {
        owner: walletAddress,
        spender: SPENDER,
        value: value,
        nonce: walletNonce,
        deadline: deadline
    }
    let typedData = await createEIP2612TypedData(domain, message)

    const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [
            walletAddress,
            typedData
        ]
    });

    let r = signature.slice(0, 66)
    let s = '0x' + signature.slice(66, 130)
    let v = parseInt(signature.slice(130, 132), 16)

    return {
        owner: walletAddress,
        spender: SPENDER,
        value,
        deadline,
        v,
        r,
        s,
    }
}

const signAndPermit = async () => {
    const usdc = tokens.USDC
    try {
        let permitMessage = await signPermitMessage(usdc.name, usdc.version, usdc.address, 1000000000);
        const contract = new window.web3.eth.Contract(usdcAbi, usdc.address)

        contract.methods.permit(
            permitMessage.owner, permitMessage.spender, permitMessage.value, permitMessage.deadline,
            permitMessage.v, permitMessage.r, permitMessage.s)
        .send({from: walletAddress}, function(err, transactionHash) {
            if (err != null) {
                console.log(err)
                alert(err.message)
            } else {
                console.log(transactionHash)
                document.querySelector('#permit-txhash').textContent = `Tx Hash: ${transactionHash}`;
            }
        })
    } catch (err) {
        console.log(err)
        alert(err.message)
    }
}

const swap = async () => {
    let sourceTokenName = document.querySelector("#select-source-token").value
    let sourceToken = tokens[sourceTokenName]
    sourceAmount = document.querySelector("#source-token-amount").value
    sourceAmount = parseFloat(sourceAmount.replace(/,/g, ''));
    sourceAmountWithDecimal = BigNumber(sourceAmount).shiftedBy(sourceToken.decimal)

    let destTokenName = document.querySelector("#select-dest-token").value
    let destToken = tokens[destTokenName]

    if (sourceToken.isPermitSupported) {
        permitAndSwap(sourceToken, sourceAmountWithDecimal.toString(), destToken)
    } else {
        swapExactETH(sourceToken, sourceAmountWithDecimal.toString(), destToken)
    }
}

const swapExactETH = async (sourceToken, sourceAmount, destToken) => {
    const contract = new window.web3.eth.Contract(swapAbi, SPENDER);

    contract.methods.swapExactInputSingle(
        [sourceAmount, sourceToken.address, destToken.address, 3000]
    ).send({from: walletAddress, value: sourceAmount}, function(err, transactionHash) {
        if (err != null) {
            console.log(err)
            alert(err.message)
        } else {
            console.log(transactionHash)
            let resultElement = document.querySelector('#swap-txhash')
            resultElement.textContent = transactionHash;
            resultElement.href = `${etherscanLink}/${transactionHash}`
        }
    })
}

const permitAndSwap = async (sourceToken, sourceAmount, destToken) => {
    let permitMessage = await signPermitMessage(sourceToken.name, sourceToken.version, sourceToken.address, sourceAmount);
    const contract = new window.web3.eth.Contract(swapAbi, SPENDER);

    contract.methods.swapExactInputSingleWithPermit(
        [sourceAmount, sourceToken.address, destToken.address, 3000],
        [permitMessage.owner, permitMessage.spender, permitMessage.value, permitMessage.deadline, permitMessage.v, permitMessage.r, permitMessage.s]
    ).send({from: walletAddress}, function(err, transactionHash) {
        if (err != null) {
            console.log(err)
            alert(err.message)
        } else {
            console.log(transactionHash)
            let resultElement = document.querySelector('#swap-txhash')
            resultElement.textContent = transactionHash;
            resultElement.href = `${etherscanLink}/${transactionHash}`
        }
    })
}
