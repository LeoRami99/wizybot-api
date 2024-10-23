import { Injectable } from '@nestjs/common';
// DTO
import { getPromptSchema, populationTypes, weatherResponseType, weatherTypes } from './dto/get-prompt/get-prompt.dto';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';


@Injectable()
export class AiService {
    constructor(private configService: ConfigService) { }

    /**
     * Generates a response based on the provided prompt using OpenAI's GPT-4 model.
     * 
     * @param {string} prompt - The input prompt to generate a response for.
     * @returns {Promise<{ ok: boolean, response?: string, error?: string }>} - An object containing the response or an error message.
     * 
     * @throws {Error} - Throws an error if the prompt validation fails.
     * 
     * The function performs the following steps:
     * 1. Validates the input prompt using a predefined schema.
     * 2. Creates an initial message array based on the prompt.
     * 3. Sends the initial message to OpenAI's chat completion API.
     * 4. If the response includes tool calls, it processes the tool calls and fetches additional data (e.g., weather and population).
     * 5. Sends an updated message array to OpenAI's chat completion API for a refined response.
     * 6. Returns the final response or an error message if any step fails.
     */
    async getPrompt(prompt: string) {
        const openai = new OpenAI({ apiKey: this.configService.get('OPEN_AI_API_KEY') });

        // Validación del prompt
        const { error } = getPromptSchema.validate({ prompt });
        if (error) {
            throw new Error(`Validation error: ${error.message}`);
        }
        const messages: ChatCompletionMessageParam[] = this.createMessage(prompt);


        try {
            const firstResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
                tools: this.toolsAi(),
            });
            if (firstResponse.choices[0].message?.tool_calls) {
                const toolCall = firstResponse.choices[0]?.message?.tool_calls[0];
                const argument = JSON.parse(toolCall.function.arguments);
                const city = argument.city;
                const toolName = toolCall.function.name;
                const weatherResponse = await this.getWeather(city) as weatherTypes;
                const populationResponse = await this.getPopulation(city) as populationTypes;

                messages.push(...this.createMessageWithTool(toolName, weatherResponse, populationResponse));

                const secondResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: messages,
                });
                return {
                    ok: true,
                    response: secondResponse.choices[0].message.content,
                };
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
     * Generates an array of chat completion message parameters based on the provided prompt.
     *
     * @param prompt - The user's input prompt to be included in the chat messages.
     * @returns An array of `ChatCompletionMessageParam` objects, including a system message and the user's prompt.
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
        ]
    }

    /**
     * Creates an array of chat completion messages using the provided tool name, weather information, and population data.
     *
     * @param toolName - The name of the tool to be used in the messages.
     * @param weather - An object containing weather information, including city, description, temperature, humidity, and wind speed.
     * @param population - An object containing population information, including city and population count.
     * @returns An array of chat completion messages formatted with the provided tool name, weather, and population data.
     */
    createMessageWithTool(toolName: string, weather: weatherTypes, population: populationTypes): ChatCompletionMessageParam[] {
        return [
            {
                role: "function",
                name: toolName,
                content: `The population of ${population.city} is ${population.population}, only this data`
            }, {
                role: 'function',
                name: toolName,
                content: `The weather in ${weather.city} is ${weather.description}, with a temperature of ${weather.temperature}°C, a humidity of ${weather.humidity}% and a wind speed of ${weather.windSpeed}m/s`
            }
        ]
    }


    /**
     * Generates an array of tools for AI chat completions.
     * 
     * @returns {ChatCompletionTool[]} An array of tools, each containing a function with its name, description, and parameters.
     * 
     * The available tools are:
     * - `getWeather`: Retrieves the weather information for a specified city.
     *   - Parameters:
     *     - `city` (string, required): The name of the city to get the weather for.
     *     - `unit` (string, optional): The unit of the temperature, either "metric" or "imperial".
     * - `getPopulation`: Retrieves the population information for a specified city.
     *   - Parameters:
     *     - `city` (string, required): The name of the city to get the population for.
     */
    toolsAi() {
        const tools: ChatCompletionTool[] = [
            {
                type: "function",
                function: {
                    name: "getWeather",
                    description: "Get the weather of a city",
                    parameters: {
                        type: "object",
                        properties: {
                            city: {
                                type: "string",
                                description: "The name of the city to get the weather for"
                            }
                        },
                        required: ["city"],
                        unit: {
                            type: "string",
                            enum: ["metric", "imperial"],
                            description: "The unit of the temperature"
                        }

                    },
                }
            },
            {
                type: "function",
                function: {
                    name: "getPopulation",
                    description: "Get the population of a city",
                    parameters: {
                        type: "object",
                        properties: {
                            city: {
                                type: "string",
                                description: "The name of the city to get the population for"
                            }
                        },
                        required: ["city"],

                    },


                }
            }
        ];
        return tools;
    }

    /**
     * Fetches the weather information for a given city using the OpenWeatherMap API.
     * 
     * @param city - The name of the city to fetch the weather for.
     * @returns A promise that resolves to an object containing weather information:
     * - `ok`: A boolean indicating if the request was successful.
     * - `city`: The name of the city.
     * - `temperature`: The current temperature in Celsius.
     * - `description`: A brief description of the weather.
     * - `humidity`: The humidity percentage.
     * - `windSpeed`: The wind speed in meters per second.
     * 
     * If an error occurs, the promise resolves to an object containing:
     * - `ok`: A boolean indicating the request was not successful.
     * - `error`: A string describing the error.
     */
    async getWeather(city: string) {
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${this.configService.get('OPEN_WEATHER_API_KEY')}&units=metric`);
            if (!response.ok) throw new Error('Error fetching weather data');

            const data = await response.json();
            return {
                ok: true,
                city: data.name,
                temperature: data.main.temp,
                description: data.weather[0].description,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed
            };
        } catch (error) {
            return {
                ok: false,
                error: `Weather API error: ${error.message}`,
            };
        }
    }


    /**
     * Fetches the population and weather data for a given city.
     * 
     * @param city - The name of the city to fetch data for.
     * @returns An object containing the city's population, weather description, temperature, humidity, and wind speed.
     *          If an error occurs, returns an object with an error message.
     * 
     * @throws Will throw an error if the response from the API is not ok.
     */
    async getPopulation(city: string) {
        try {
            const response = await fetch(`https://place-population-finder-api.p.rapidapi.com/${city}`, {
                headers: {
                    "x-rapidapi-key": this.configService.get('RAPID_API_KEY'),
                    "x-rapidapi-host": "place-population-finder-api.p.rapidapi.com",
                }
            });
            if (!response.ok) throw new Error('Error fetching population data');

            const data = await response.json();
            return {
                city: data.city,
                population: data.population,
                description: data.weather[0].description,
                temperature: data.main.temp,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed
            };
        } catch (error) {
            return {
                ok: false,
                error: `Population API error: ${error.message}`,
            };
        }
    }
}
