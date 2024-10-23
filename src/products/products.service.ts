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
