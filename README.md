# 1inch Fusion Order Script with Permit2

This script demonstrates how to create a 1inch Fusion swap order on the Ethereum network using the `@1inch/fusion-sdk` and `@uniswap/permit2-sdk`. It handles token approvals via Uniswap's Permit2 contract, creates the Fusion order parameters, signs the necessary messages (Permit2 and the Fusion order itself), and prepares the payload for submission to the 1inch Relayer API.

## Prerequisites

1.  **Node.js and npm/yarn:** Ensure you have Node.js installed.
2.  **Dependencies:** Install the required libraries:
    ```bash
    npm install @1inch/fusion-sdk@^2 ethers@^6 @uniswap/permit2-sdk
    # or
    yarn add @1inch/fusion-sdk@^2 ethers@^6 @uniswap/permit2-sdk
    ```
3.  **Private Key Handling:**
    *   The script attempts to load a `getPrivateKey` function from `keyHandler.js`. If this file exists and exports such a function, it will be used to fetch the private key.
    *   If `keyHandler.js` is not found, the script will prompt you to enter the private key directly in the terminal. **Warning:** Entering private keys directly is insecure. Optionally, create a `keyHandler.js` or environment variables for better security practices in production environments.
4.  **1inch Dev Portal API Key:** You need an API key from the [1inch Developer Portal](https://portal.1inch.dev/). This key must be set as an environment variable named `DEV_PORTAL_KEY`.
    ```bash
    export DEV_PORTAL_KEY='your_api_key_here'
    ```

## Configuration

The script uses constants defined near the top for network and token details:

*   `chainId`: Set to `1` for Ethereum Mainnet.
*   `ONE_INCH_ROUTER`: The 1inch Aggregation Router v6 address on most networks.
*   `USDC`, `wETH`, `cbBTC`: Addresses for specific tokens on the Ethereum network. Modify these if swapping different tokens.
*   `ethersProvider`: Configured to use `https://eth.llamarpc.com`. You can change this to your preferred Ethereum RPC provider URL.
*   `fusionOrderParams`: Contains the parameters for the Fusion order, including the amount to swap, token addresses, and wallet address. Adjust these values as needed. Read more at [1inch Fusion documentation](https://github.com/1inch/fusion-sdk/tree/main?tab=readme-ov-file#how-to-swap-with-fusion-mode)

## Usage

1.  Ensure all prerequisites are met (dependencies installed, `Permit2.json` present, `DEV_PORTAL_KEY` environment variable set).
2.  Optionally, create `keyHandler.js` to handle private key retrieval securely.
3.  Run the script:
    ```bash
    node permit2.cjs
    ```
4.  If `keyHandler.js` is not found, the script will prompt you to enter the private key directly in the terminal.
