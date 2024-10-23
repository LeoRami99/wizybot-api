import { Injectable } from '@nestjs/common';
// DTO
import { getPromptSchema, populationTypes, weatherResponseType, weatherTypes } from './dto/get-prompt/get-prompt.dto';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';


@Injectable()
export class AiService {
    constructor(private configService: ConfigService) { }

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
