const targetNetworkId = "0x5";
const USDC_CONTRACT = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
const SPENDER = "0x62805A97AA27D7173545b1692d54a2DdDC3dE7C2";
let walletAddress;
let usdcAbi;

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

async function connect() {
    let response = await fetch("./abi/usdc.json")
    usdcAbi = await response.json()
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
    } else {
        alert("No wallet");
    }
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

const signPermitMessage = async function() {
    const domain = {
        name: "USD Coin",
        version: "2",
        chainId: 5,
        verifyingContract: USDC_CONTRACT
    }
    let walletNonce = await getNonce()
    let deadline = Math.floor(new Date().getTime() / 1000) + 1800
    let value = "1000000000";
    const message = {
        owner: walletAddress,
        spender: SPENDER,
        value: value,
        nonce: walletNonce,
        deadline: deadline
    }
    let typedData = await createEIP2612TypedData(domain, message)
    console.log(walletAddress);
    try {
        const signature = await window.ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [
                walletAddress,
                typedData
            ]
        });
        console.log(signature)
        let r = signature.slice(0, 66)
        let s = '0x' + signature.slice(66, 130)
        let v = parseInt(signature.slice(130, 132), 16)
        console.log("r", r, "s", s, "v", v)
        return {
            owner: walletAddress,
            spender: SPENDER,
            value,
            deadline,
            v,
            r,
            s,
        }
    } catch (err) {
        console.log(err)
    }
}

const signAndPermit = async () => {
    let permitMessage = await signPermitMessage();
    const contract = new window.web3.eth.Contract(usdcAbi, USDC_CONTRACT)

    let fromAddress = "0x2e7af6aE90E7581c111f52a058d5f5f206bfBBF6";
    contract.methods.permit(
        permitMessage.owner, permitMessage.spender, permitMessage.value, permitMessage.deadline,
        permitMessage.v, permitMessage.r, permitMessage.s)
    .send({from: fromAddress}, function(err, transactionHash) {
        if (err != null) {
            console.log(err)
            alert(err.message)
        } else {
            console.log(transactionHash)
            document.querySelector('#permit-txhash').textContent = `Tx Hash: ${transactionHash}`;
        }
    })
}
