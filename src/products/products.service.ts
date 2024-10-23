import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as csv from 'csv-parser';
import { join } from 'path';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { getPromptSchema } from 'src/ai/dto/get-prompt/get-prompt.dto';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';

interface Product {
    displayTitle: string;
    embeddingText: string;
    url: string;
    imageUrl: string;
    productType: string;
    discount: string;
    price: string;
    variants: string;
    createDate: string;
}

@Injectable()
export class ProductsService {
    constructor(private configService: ConfigService) { }

    /**
     * Generates a response based on the provided AI prompt using OpenAI's API.
     * 
     * @param prompt - The input prompt string to be processed by the AI.
     * @returns An object containing the response from the AI or an error message.
     * 
     * @throws Will throw an error if the prompt validation fails.
     * 
     * The function performs the following steps:
     * 1. Validates the input prompt using a predefined schema.
     * 2. Initializes the OpenAI client with the API key from the configuration service.
     * 3. Creates the initial message array based on the input prompt.
     * 4. Sends the initial prompt to the OpenAI API and processes the response.
     * 5. If the response includes tool calls, it handles specific functions like `searchProduct` and `convertCurrencies`.
     * 6. For `searchProduct`, it searches for products and generates a summary, then sends a follow-up prompt to the AI.
     * 7. For `convertCurrencies`, it converts the specified currency and sends a follow-up prompt to the AI.
     * 8. Returns the final response from the AI or an error message if any step fails.
     */
    async aiPrompt(prompt: string) {
        const { error } = getPromptSchema.validate({ prompt });
        if (error) {
            throw new Error(`Validation error: ${error.message}`);
        }

        const openai = new OpenAI({ apiKey: this.configService.get('OPEN_AI_API_KEY') });

        const messages = this.createMessage(prompt);

        try {
            const firstResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
                tools: this.tools(),

            });
            const message = firstResponse.choices[0].message;
            if (message.tool_calls) {
                const functionName = message.tool_calls[0].function.name;
                const functionArgs = JSON.parse(message.tool_calls[0].function.arguments);

                if (functionName === 'searchProduct') {
                    const search = functionArgs.search;
                    const products = await this.searchProduct(search);

                    const productSummaries = products.map(product => `
                        Product: ${product.displayTitle}
                        Price: ${product.price}
                        Discount: ${product.discount}
                        Type: ${product.productType}
                        URL: ${product.url}
                    `).join('\n\n');

                    const secondResponse = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            ...messages,
                            {
                                role: 'function',
                                name: 'searchProduct',
                                content: `${productSummaries} check the list of products and recommend one to the user`,
                            },
                        ],
                    });

                    return {
                        ok: true,
                        response: secondResponse.choices[0].message.content,
                    };
                }


                if (functionName === 'convertCurrencies') {
                    const currency = functionArgs.currency;
                    const value = functionArgs.value;
                    const baseCurrency = functionArgs.baseCurrency;
                    const converted = await this.convertCurrencies(baseCurrency, currency, value);
                    const conversionMessage = `
                        Convert ${value} ${baseCurrency} to ${currency}: ${converted.convertedValue} ${currency}
                    `;



                    const secondResponse = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            ...messages,
                            {
                                role: 'function',
                                name: 'convertCurrencies',
                                content: conversionMessage,
                            },
                        ],
                    });

                    return {
                        ok: true,
                        response: secondResponse.choices[0].message.content,
                    };
                }
            } else {
                return {
                    ok: true,
                    response: firstResponse.choices[0].message.content,
                };
            }
        } catch (error) {
            return {
                ok: false,
                error: `Error in OpenAI API: ${error.message}`,
            };
        }
    }

    /**
     * Searches for products in a CSV file that match the given search string.
     * 
     * @param _search - The search string to match against the product's display title.
     * @returns A promise that resolves to an array of products that match the search criteria.
     * 
     * The products are read from a CSV file located at `data/products_list.csv`.
     * Each product is represented by an object containing the following properties:
     * - `displayTitle`: The title of the product.
     * - `embeddingText`: The embedding text of the product.
     * - `url`: The URL of the product.
     * - `imageUrl`: The image URL of the product.
     * - `productType`: The type of the product.
     * - `discount`: The discount on the product.
     * - `price`: The price of the product.
     * - `variants`: The variants of the product.
     * - `createDate`: The creation date of the product.
     * 
     * The resulting array of products is sorted by the creation date in descending order.
     * 
     * @throws {InternalServerErrorException} If there is an error processing the CSV file.
     */
    async searchProduct(_search: string): Promise<Product[]> {
        const products: Product[] = [];
        return new Promise((resolve, reject) => {
            const filePath = join(__dirname, '..', '..', 'data', 'products_list.csv');

            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    if (row.displayTitle && row.displayTitle.toLowerCase().includes(_search.toLowerCase())) {
                        products.push({
                            displayTitle: row.displayTitle,
                            embeddingText: row.embeddingText,
                            url: row.url,
                            imageUrl: row.imageUrl,
                            productType: row.productType,
                            discount: row.discount,
                            price: row.price,
                            variants: row.variants,
                            createDate: row.createDate,
                        });
                    }
                })
                .on('end', () => {
                    products.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
                    resolve(products);
                })
                .on('error', (error) => {
                    console.error('Error reading CSV file:', error);
                    reject(new InternalServerErrorException('Error processing CSV file'));
                });
        });
    }

    /**
     * Converts a value from one currency to another using the Free Currency API.
     *
     * @param baseCurrency - The currency code of the base currency (e.g., 'USD').
     * @param currency - The currency code to which the value should be converted (e.g., 'EUR').
     * @param value - The amount of money to be converted.
     * @returns An object containing the target currency, the original value, and the converted value.
     * @throws {InternalServerErrorException} If there is an error fetching or processing the currency data.
     */
    async convertCurrencies(baseCurrency: string, currency: string, value: number) {
        try {
            const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${process.env.FREE_CURRENCY_API_KEY}&currencies=${currency}&base_currency=${baseCurrency}`);

            if (!response.ok) {
                throw new Error('Error fetching currency data');
            }

            const data = await response.json();

            if (!data.data[currency]) {
                throw new Error(`Currency ${currency} not found in the response`);
            }

            const exchangeRate = data.data[currency];
            const convertedValue = value * exchangeRate;

            return {
                currency,
                value,
                convertedValue,
            };
        } catch (error) {
            throw new InternalServerErrorException('Error converting currencies');
        }
    }

    /**
     * Creates a message array for chat completion.
     * 
     * @param prompt - The user input to be included in the message.
     * @returns An array of chat completion message parameters.
     */
    createMessage(prompt: string): ChatCompletionMessageParam[] {
        return [
            {
                role: 'system',
                content: 'You are a helpful assistant.',
            },
            {
                role: 'user',
                content: prompt
            }
        ];
    }


    /**
     * Provides a set of tools for various functionalities.
     * 
     * @returns {ChatCompletionTool[]} An array of tools with their respective functions and parameters.
     * 
     * The available tools are:
     * 
     * - `convertCurrencies`: Converts a value from one currency to another.
     *   - Parameters:
     *     - `baseCurrency` (string): The currency to convert from.
     *     - `currency` (string): The currency to convert to.
     *     - `value` (number): The value to convert.
     * 
     * - `searchProduct`: Searches for a product by name.
     *   - Parameters:
     *     - `search` (string): The name of the product to search for.
     */
    tools() {
        const tools: ChatCompletionTool[] = [
            {
                type: "function",
                function: {
                    name: "convertCurrencies",
                    description: "Convert a value from one currency to another",
                    parameters: {
                        type: "object",
                        properties: {
                            currency: {
                                type: "string",
                                description: "The currency to convert to"
                            },
                            value: {
                                type: "number",
                                description: "The value to convert"
                            },
                            baseCurrency: {
                                type: "string",
                                description: "The currency to convert from"
                            }
                        },
                        required: ["baseCurrency", "currency", "value"],
                    },
                }
            },
            {
                type: "function",
                function: {
                    name: "searchProduct",
                    description: "Search for a product",
                    parameters: {
                        type: "object",
                        properties: {
                            search: {
                                type: "string",
                                description: "Search for products by name"
                            }
                        },
                        required: ["search"],
                    },
                }
            }
        ];
        return tools;
    }
}
