const fusionSDK = require('@1inch/fusion-sdk');
const { ethers } = require('ethers');
const Permit2SDK = require('@uniswap/permit2-sdk');
const { AllowanceTransfer } = require('@uniswap/permit2-sdk');

const PERMIT2_ABI = require('./Permit2.json');

let getPrivateKey;
try {
    // Attempt to import getPrivateKey from keyHandler.js
    ({ getPrivateKey } = require('./keyHandler'));
} catch (err) {
    console.warn('keyHandler.js not found. Ensure you provide the private key manually.');
}

Error.stackTraceLimit = Infinity; // Set stack trace limit to Infinity

const toDeadline = (expiration) => {
    return Date.now() + expiration / 1000; // division here because we need it in seconds as that's what the blockchain deals with
}

// used to convert BigInt values to strings for JSON serialization
const transformBigInts = obj => typeof obj === 'bigint' ? obj.toString() : Array.isArray(obj) ? obj.map(transformBigInts) : obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, transformBigInts(v)])) : obj;
// used to convert ethers v5 BigNumber objects to BigInt
const convertToBigInt = obj => (typeof obj !== 'object' || obj === null) ? obj : Array.isArray(obj) ? obj.map(convertToBigInt) : (obj._hex && (obj._isBigNumber || typeof obj.toHexString === 'function')) ? (() => { try { return BigInt(typeof obj.toHexString === 'function' ? obj.toHexString() : obj._hex); } catch (e) { console.warn("Failed to convert object to BigInt:", obj, e); return obj; } })() : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, convertToBigInt(v)]));

Error.stackTraceLimit = Infinity; // Set stack trace limit to Infinity

const chainId = 1; // Ethereum chain ID
const ONE_INCH_ROUTER = '0x111111125421ca6dc452d289314280a0f8842a65';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on ethereum
const wETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // WETH on ethereum
const cbBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'; // cbBTC on ethereum


async function restOfLogic(pkey) {

    const ethersProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
    const signer = new ethers.Wallet(pkey, ethersProvider);
    const thirtyMinutes = 30 * 60 * 1000;
    const permit2 = new ethers.Contract(Permit2SDK.PERMIT2_ADDRESS, PERMIT2_ABI, signer);

    // allowance(token, owner, spender); see below:
    const data = await permit2.allowance.staticCall(USDC,signer.address,ONE_INCH_ROUTER);
    let { amount, expiration, nonce } = data;
    console.log(`Amount: ${amount}, Expiration: ${expiration}, Nonce: ${nonce.toString()}`);
    let deadline = toDeadline(thirtyMinutes);
    if (amount < Permit2SDK.MaxAllowanceTransferAmount) {
        const permitSingle = {
            details: {
                token: USDC,
                amount: Permit2SDK.MaxAllowanceTransferAmount,
                expiration: deadline, // This is the expiration time in general in case 100% of the allowance is not spent
                nonce: nonce, // Use the BigInt nonce directly from the allowance call result
            },
            spender: ONE_INCH_ROUTER,
            sigDeadline: deadline, // this is the validity time for the signature only.
        }

        const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingle, Permit2SDK.PERMIT2_ADDRESS, chainId)

        // Convert domain and values recursively
        const convertedDomain = convertToBigInt(domain);
        const convertedValues = convertToBigInt(values);

        // Ensure nonce in values is also BigInt if it wasn't already
        if (convertedValues.details && typeof convertedValues.details.nonce !== 'bigint') {
            try {
                convertedValues.details.nonce = BigInt(convertedValues.details.nonce);
            } catch (e) {
                 console.error("Failed to convert values.details.nonce to BigInt:", convertedValues.details.nonce, e);
                 // Handle error appropriately, maybe throw or default
            }
        }
        
        // Use the converted objects for signing
        const permit2Signature = await signer.signTypedData(convertedDomain, types, convertedValues);
        console.log(permit2Signature); // valid permit2 signature
        const compact = ethers.Signature.from(permit2Signature).compactSerialized;
        const fusionOrderParams = {
            amount: 1000000n, // 1 USDC as a BigInt
            fromTokenAddress: USDC,
            toTokenAddress: cbBTC,
            walletAddress: signer.address,
            permit: ethers.AbiCoder.defaultAbiCoder().encode([
                // owner
                'address',
                // PermitSingle struct: tuple(PermitDetails details, address spender, uint256 sigDeadline)
                // PermitDetails struct: tuple(address token, uint160 amount, uint48 expiration, uint48 nonce)
                'tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)',
                // signature
                'bytes'
            ], [
                signer.address, // owner
                [
                    [
                        permitSingle.details.token, // token
                        permitSingle.details.amount._hex, // amount
                        permitSingle.details.expiration, // expiration
                        permitSingle.details.nonce, // nonce
                    ],
                    permitSingle.spender, // spender
                    permitSingle.sigDeadline, // sigDeadline
                ],
                compact, // permit2 signature
            ]),
            isPermit2: true,
            enableEstimate: true,
        };

        // Create a wrapper object conforming to the Web3Like interface
        const web3LikeProvider = {
            eth: {
                call: ethersProvider.call.bind(ethersProvider),
            },
                extend: function(extension) {
                return this;
            }
        };

        const blockchainProvider = new fusionSDK.PrivateKeyProviderConnector(
            pkey,
            web3LikeProvider, // Pass the wrapper object
        );

        const sdk = new fusionSDK.FusionSDK({
            blockchainProvider: blockchainProvider,
            url: 'https://api.1inch.dev/fusion', // base URL
            network: chainId, // Ethereum mainnet
            // IMPORTANT: Ensure DEV_PORTAL_KEY is set as an environment variable
            // DO NOT hardcode your API key here.
            authKey: process.env["DEV_PORTAL_KEY"], // auth key
        })

        const {order, hash, quoteId} = await sdk.createOrder(fusionOrderParams);

        // log the order as a single line because we don't need it formatted
        console.log(`Order: ${JSON.stringify(transformBigInts(order))}`);
        console.log(`OrderHash: ${hash}`);
        console.log(`QuoteId: ${quoteId}`);

        const orderStruct = order.build();
        const typedData = order.getTypedData(chainId);

        // Sign using the correct domain, types, and message (value)
        const orderSignature = await signer.signTypedData(
            typedData.domain,
            { 'Order' : typedData.types['Order'] },
            typedData.message // Use the original message; ethers handles BigInts here
        );

        const body = {
            order: orderStruct,
            signature: orderSignature,
            quoteId: quoteId,
            extension: order.extension.encode(),
        };

        console.log(`OrderInfo for API: ${JSON.stringify(transformBigInts(body))}`);

        // this is where broadcasting is handled in case you would like to do it automatically
        /*
        fetch('https://api.1inch.dev/fusion/relayer/v2.0/1/order/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // IMPORTANT: Ensure DEV_PORTAL_KEY is set as an environment variable
                'Authorization': 'Bearer ' + process.env['DEV_PORTAL_KEY'],
            },
            // Stringify the body *after* potential BigInt transformation for JSON compatibility
            body: JSON.stringify(transformBigInts(body)),
        })
        .then(async response => { // Make the callback async to handle potential errors better
            // Read the response body as text first, regardless of status
            const responseText = await response.text();

            if (!response.ok) {
                // If response is not OK, use the text directly in the error
                console.error('API Error:', response.status, response.statusText, responseText);
                throw new Error(`API request failed with status ${response.status}: ${responseText}`);
            }

            // If response is OK, check if the text is empty or whitespace
            if (!responseText || responseText.trim() === '') {
                // Handle empty successful response (e.g., HTTP 204 No Content)
                console.log('Success: Order submitted successfully (No JSON content in response). Status:', response.status);
                // You might not need to do anything else here, or return a specific success indicator
                return; // Exit the .then handler
            }

            // If response is OK and text is not empty, try parsing as JSON
            try {
                const responseData = JSON.parse(responseText);
                console.log('Success:', responseData);
            } catch (parseError) {
                // Handle cases where the non-empty response is still not valid JSON
                console.error('JSON Parse Error:', parseError);
                console.error('Received non-JSON response text:', responseText);
                throw new Error(`Failed to parse API response as JSON. Status: ${response.status}. Response: ${responseText}`);
            }
        })
        .catch((error) => {
            // This will catch errors from the fetch itself or the thrown errors above
            console.error('Fetch/Processing Error:', error);
        });

        */

    }
}

(async function main() {
    let pkey = '';

    try {
        if (getPrivateKey) {
            // Use getPrivateKey from keyHandler.js
            pkey = await getPrivateKey();
        } else {
            // Fallback: Prompt user to manually provide the private key
            console.log('Enter your private key manually:');
            const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
            pkey = await new Promise(resolve => rl.question('', answer => {
                rl.close();
                resolve(answer.trim());
            }));
        }
        // Call restOfLogic with the private key
        await restOfLogic(pkey);

    } catch (err) {
        console.error('An error occurred:', err);
    }
})();