(() => {
    const App = (() => {
        // 1. Referencias al DOM
        const htmlElements = {
            form: document.querySelector('#formulario-busqueda'),
            input: document.querySelector('#entrada-pokemon'),
            resultsContainer: document.querySelector('#contenedor-resultados'),
            historyContainer: document.querySelector('#contenedor-tarjetas-historial'),
            favoritesContainer: document.querySelector('#contenedor-tarjetas-favoritos'),
            searchTypeSelect: document.querySelector('#search-type-select')
        };

        // 2. Módulo de Almacenamiento (LocalStorage)
        const Storage = {
            getHistory() {
                try {
                    const history = localStorage.getItem('pokemonHistory');
                    return history ? JSON.parse(history) : [];
                } catch (error) {
                    console.error('Error loading history:', error);
                    return [];
                }
            },

            saveHistory(history) {
                try {
                    localStorage.setItem('pokemonHistory', JSON.stringify(history));
                } catch (error) {
                    console.error('Error saving history:', error);
                }
            },

            getFavorites() {
                try {
                    const favorites = localStorage.getItem('pokemonFavorites');
                    return favorites ? JSON.parse(favorites) : [];
                } catch (error) {
                    console.error('Error loading favorites:', error);
                    return [];
                }
            },

            saveFavorites(favorites) {
                try {
                    localStorage.setItem('pokemonFavorites', JSON.stringify(favorites));
                } catch (error) {
                    console.error('Error saving favorites:', error);
                }
            },

            getCache() {
                try {
                    const cache = localStorage.getItem('pokemonCache');
                    return cache ? JSON.parse(cache) : {};
                } catch (error) {
                    console.error('Error loading cache:', error);
                    return {};
                }
            },

            saveCache(cache) {
                try {
                    localStorage.setItem('pokemonCache', JSON.stringify(cache));
                } catch (error) {
                    console.error('Error saving cache:', error);
                }
            },

            getFromCache(pokemonId) {
                const cache = this.getCache();
                return cache[pokemonId] || null;
            },

            saveToCache(pokemonData) {
                const cache = this.getCache();
                cache[pokemonData.id] = {
                    ...pokemonData,
                    cachedAt: new Date().toISOString()
                };
                this.saveCache(cache);
            },

            addToHistory(pokemonData) {
                const history = this.getHistory();

                const existingIndex = history.findIndex(item => item.id === pokemonData.id);

                if (existingIndex !== -1) {
                    const existing = history.splice(existingIndex, 1)[0];
                    history.unshift(existing);
                } else {
                    history.unshift(pokemonData);

                    if (history.length > 20) {
                        history.pop();
                    }
                }

                this.saveHistory(history);
                return history;
            },

            addToFavorites(pokemonData) {
                const favorites = this.getFavorites();

                const existingIndex = favorites.findIndex(item => item.id === pokemonData.id);

                if (existingIndex === -1) {
                    favorites.push(pokemonData);
                    this.saveFavorites(favorites);
                }

                return favorites;
            },

            removeFromFavorites(pokemonId) {
                const favorites = this.getFavorites();
                const updatedFavorites = favorites.filter(item => item.id !== pokemonId);
                this.saveFavorites(updatedFavorites);
                return updatedFavorites;
            },

            removeFromHistory(pokemonId) {
                const history = this.getHistory();
                const updatedHistory = history.filter(item => item.id !== pokemonId);
                this.saveHistory(updatedHistory);

                // Elimina también el cache cuando se elimina del historial
                this.removeFromCache(pokemonId);

                return updatedHistory;
            },

            removeFromCache(pokemonId) {
                const cache = this.getCache();
                delete cache[pokemonId];
                this.saveCache(cache);
            },

            isFavorite(pokemonId) {
                const favorites = this.getFavorites();
                return favorites.some(item => item.id === pokemonId);
            }
        };

        // 3. Funciones de Utilidad
        const utils = {
            render(container, html) {
                if (container && html) {
                    container.innerHTML = html;
                }
            },

            clear(container) {
                if (container) {
                    container.innerHTML = '';
                }
            },

            focusInput(input) {
                if (input) {
                    input.focus();
                }
            },

            validateInput(text) {
                return text && text.trim().length > 0;
            },

            extractIdFromUrl(url) {
                if (!url) return null;
                const parts = url.split('/');
                return parseInt(parts[parts.length - 2]);
            },

            formatDate(timestamp) {
                return new Date(timestamp).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            },

            async fetchWithTimeout(url, timeout = 10000) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                try {
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error('Pokémon o habilidad no encontrado');
                        }
                        throw new Error(`Error HTTP: ${response.status}`);
                    }

                    return await response.json();

                } catch (error) {
                    clearTimeout(timeoutId);

                    if (error.name === 'AbortError') {
                        throw new Error('Tiempo de espera agotado');
                    }

                    if (error.message.includes('Failed to fetch')) {
                        throw new Error('Error de conexión. Verifica tu internet');
                    }

                    throw error;
                }
            },

            async fetchPokemon(query) {
                try {
                    const queryStr = typeof query === 'number' ? query.toString() : query;

                    // Primero verificar si está en cache
                    const cached = await this.fetchPokemonFromCache(queryStr);
                    if (cached) {
                        return { ...cached, fromCache: true };
                    }

                    // Si no está en cache, busca en API
                    const url = `https://pokeapi.co/api/v2/pokemon/${queryStr.toLowerCase()}`;
                    const data = await this.fetchWithTimeout(url);

                    // Guarda también en caché para futuras búsquedas (VS y buscador)
                    const cacheData = {
                        id: data.id,
                        name: data.name,
                        sprites: data.sprites,
                        types: data.types,
                        abilities: data.abilities,
                        stats: data.stats,
                        cachedAt: new Date().toISOString()
                    };
                    Storage.saveToCache(cacheData);

                    return { ...cacheData, fromCache: false };
                } catch (error) {
                    console.error('Error en fetchPokemon:', error);
                    throw error;
                }
            },

            async fetchPokemonFromCache(query) {
                try {
                    // Intenta parsear como ID
                    const id = parseInt(query);
                    if (!isNaN(id)) {
                        const cached = Storage.getFromCache(id);
                        if (cached) {
                            // Verifica si el cache no es muy viejo (1 hora)
                            const cacheAge = new Date() - new Date(cached.cachedAt);
                            if (cacheAge < 3600000) { // 1 hora en milisegundos
                                return cached;
                            }
                        }
                    }

                    // Si no es ID o no está en cache, busca por nombre en el historial
                    const history = Storage.getHistory();
                    const fromHistory = history.find(p =>
                        p.name.toLowerCase() === query.toLowerCase()
                    );

                    if (fromHistory) {
                        // Verifica si está en cache también
                        const cached = Storage.getFromCache(fromHistory.id);
                        if (cached) {
                            const cacheAge = new Date() - new Date(cached.cachedAt);
                            if (cacheAge < 3600000) {
                                return cached;
                            }
                        }
                    }

                    return null;
                } catch (error) {
                    console.error('Error en fetchPokemonFromCache:', error);
                    return null;
                }
            },

            async fetchAbility(query) {
                try {
                    const url = `https://pokeapi.co/api/v2/ability/${query.toLowerCase()}`;
                    const data = await this.fetchWithTimeout(url);

                    const spanishEffect = data.effect_entries?.find(
                        entry => entry.language.name === 'es'
                    ) || data.effect_entries?.[0];

                    return {
                        id: data.id,
                        name: data.name,
                        effect_entries: data.effect_entries,
                        pokemon: data.pokemon,
                        fromCache: false
                    };
                } catch (error) {
                    console.error('Error en fetchAbility:', error);
                    throw error;
                }
            },

            async fetchSpecies(query) {
                try {
                    const url = `https://pokeapi.co/api/v2/pokemon-species/${query.toLowerCase()}`;
                    return await this.fetchWithTimeout(url);
                } catch (error) {
                    console.error('Error en fetchSpecies:', error);
                    throw error;
                }
            },

            async fetchEvolutionChain(id) {
                try {
                    const url = `https://pokeapi.co/api/v2/evolution-chain/${id}`;
                    return await this.fetchWithTimeout(url);
                } catch (error) {
                    console.error('Error en fetchEvolutionChain:', error);
                    throw error;
                }
            },

            async fetchPokemonDetails(pokemonUrl) {
                try {
                    const response = await fetch(pokemonUrl);
                    if (!response.ok) {
                        return null;
                    }
                    const data = await response.json();
                    return {
                        id: data.id,
                        name: data.name,
                        sprite: data.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${data.id}.png`
                    };
                } catch (error) {
                    return null;
                }
            },

            async fetchPokemonWithAbility(abilityData) {
                const pokemonPromises = abilityData.pokemon.map(async (pokemonEntry) => {
                    const pokemonDetails = await this.fetchPokemonDetails(pokemonEntry.pokemon.url);
                    if (pokemonDetails) {
                        return {
                            ...pokemonDetails,
                            is_hidden: pokemonEntry.is_hidden
                        };
                    }
                    return null;
                });

                const pokemonResults = await Promise.all(pokemonPromises);
                const pokemonWithAbility = pokemonResults.filter(p => p !== null);

                return pokemonWithAbility;
            },

            async fetchEvolutionChainData(pokemonId) {
                try {
                    const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}/`);
                    const speciesData = await speciesResponse.json();

                    const evolutionResponse = await fetch(speciesData.evolution_chain.url);
                    const evolutionData = await evolutionResponse.json();

                    const evolutionChain = [];

                    const extractChain = (chain, level = 0, evolvesFrom = null) => {
                        const pokemonId = parseInt(chain.species.url.split('/').slice(-2, -1)[0]);

                        evolutionChain.push({
                            id: pokemonId,
                            name: chain.species.name,
                            sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`,
                            level: level,
                            evolves_from: evolvesFrom
                        });

                        const currentId = pokemonId;

                        if (chain.evolves_to.length > 0) {
                            chain.evolves_to.forEach(next => {
                                extractChain(next, level + 1, currentId);
                            });
                        }
                    };

                    extractChain(evolutionData.chain, 0, null);
                    return evolutionChain;
                } catch (error) {
                    console.error('Error fetching evolution chain:', error);
                    return [];
                }
            },

            async fetchPokemonWithEvolution(query) {
                const pokemon = await this.fetchPokemon(query);

                // Guarda en cache si vino de API
                if (!pokemon.fromCache) {
                    const cacheData = {
                        id: pokemon.id,
                        name: pokemon.name,
                        sprites: pokemon.sprites,
                        types: pokemon.types,
                        abilities: pokemon.abilities,
                        stats: pokemon.stats,
                        cachedAt: new Date().toISOString()
                    };
                    Storage.saveToCache(cacheData);
                }

                const historyData = {
                    id: pokemon.id,
                    name: pokemon.name,
                    sprite: pokemon.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
                    types: pokemon.types.map(t => t.type.name.toUpperCase()),
                    timestamp: new Date().toISOString(),
                    fromCache: pokemon.fromCache || false
                };

                Storage.addToHistory(historyData);

                const evolutionChain = await this.fetchEvolutionChainData(pokemon.id);

                return { pokemon, evolutionChain, fromCache: pokemon.fromCache || false };
            },

            async fetchAbilityWithPokemon(query) {
                const ability = await this.fetchAbility(query);
                const pokemonWithAbility = await this.fetchPokemonWithAbility(ability);

                return { ability, pokemonWithAbility, fromCache: false };
            },

            formatEvolutionDetails(details) {
                if (!details) return null;

                const conditions = [];

                if (details.min_level) {
                    conditions.push(`Nivel ${details.min_level}`);
                }

                if (details.item) {
                    conditions.push(`Con ${details.item.name}`);
                }

                if (details.trigger && details.trigger.name !== 'level-up') {
                    conditions.push(details.trigger.name.replace('-', ' '));
                }

                if (details.min_happiness) {
                    conditions.push(`Felicidad ${details.min_happiness}`);
                }

                if (details.min_affection) {
                    conditions.push(`Cariño ${details.min_affection}`);
                }

                if (details.time_of_day) {
                    conditions.push(`Por la ${details.time_of_day}`);
                }

                if (details.known_move_type) {
                    conditions.push(`Movimiento tipo ${details.known_move_type.name}`);
                }

                if (details.location) {
                    conditions.push(`En ${details.location.name}`);
                }

                return conditions.length > 0 ? conditions.join(' • ') : 'Nivel up';
            }
        };

        // 4. Plantillas HTML (Vistas)
        const templates = {
            // Tarjeta principal de Pokémon
            card: (pokemon, evolutionChain = [], fromCache = false) => {
                const typesHtml = pokemon.types.map(t => `<span class="etiqueta-tipo">${t.type.name}</span>`).join('');

                const abilitiesHtml = pokemon.abilities
                    .map(a => {
                        const isHidden = a.is_hidden;
                        const abilityName = a.ability.name;
                        const displayName = isHidden ? `${abilityName} (OCULTA)` : abilityName;
                        const abilityClass = isHidden ? 'oculta' : 'normal';

                        return `<span class="elemento-habilidad ${abilityClass}">${displayName}</span>`;
                    })
                    .join('');

                const statsHtml = pokemon.stats.map(s => `
                    <div class="etiqueta-estadistica">${s.stat.name.toUpperCase()}:</div>
                    <div class="contenedor-barra-estadistica">
                        <div class="barra-estadistica" style="width: ${Math.min(s.base_stat, 100)}%"></div>
                    </div>
                `).join('');

                let evolutionHtml = '';
                if (evolutionChain.length > 0) {
                    evolutionChain.sort((a, b) => {
                        if (a.level !== b.level) return a.level - b.level;
                        return a.name.localeCompare(b.name);
                    });

                    const currentEvo = evolutionChain.find(e => e.id === pokemon.id);

                    if (currentEvo) {
                        const directEvolutions = evolutionChain.filter(e =>
                            e.evolves_from === currentEvo.id
                        );

                        const preEvolution = evolutionChain.find(e =>
                            currentEvo.evolves_from === e.id
                        );

                        let siblingEvolutions = [];
                        if (preEvolution) {
                            siblingEvolutions = evolutionChain.filter(e =>
                                e.evolves_from === preEvolution.id && e.id !== currentEvo.id
                            );
                        }

                        const buildCompleteChain = () => {
                            const chain = [];

                            let start = evolutionChain.find(e => e.evolves_from === null);
                            if (!start) return [currentEvo];

                            const visited = new Set();
                            const stack = [start];

                            while (stack.length > 0) {
                                const current = stack.pop();

                                if (!visited.has(current.id)) {
                                    visited.add(current.id);
                                    chain.push(current);

                                    const nextEvolutions = evolutionChain.filter(e =>
                                        e.evolves_from === current.id
                                    );

                                    nextEvolutions.sort((a, b) => a.name.localeCompare(b.name));

                                    for (let i = nextEvolutions.length - 1; i >= 0; i--) {
                                        stack.push(nextEvolutions[i]);
                                    }
                                }
                            }

                            return chain;
                        };

                        const completeChain = buildCompleteChain();

                        const isLinearChain = () => {
                            let multiEvoCount = 0;

                            evolutionChain.forEach(poke => {
                                const evolutionsFrom = evolutionChain.filter(e => e.evolves_from === poke.id);
                                if (evolutionsFrom.length > 1) {
                                    multiEvoCount++;
                                }
                            });

                            return multiEvoCount === 0;
                        };

                        let evolutionRowsHtml = '';

                        if (isLinearChain() && completeChain.length > 1) {
                            const currentIndex = completeChain.findIndex(p => p.id === currentEvo.id);

                            evolutionRowsHtml = `<div class="fila-evolucion evolucion-horizontal">`;

                            completeChain.forEach((poke, index) => {
                                const isCurrent = poke.id === pokemon.id;
                                evolutionRowsHtml += `
                                    <div class="caja-evolucion ${isCurrent ? 'actual' : 'otra'}" 
                                         data-pokemon-id="${poke.id}" 
                                         data-pokemon-name="${poke.name}">
                                        <img src="${poke.sprite}" alt="${poke.name}" class="sprite-evolucion">
                                        <div class="nombre-evolucion">${poke.name}</div>
                                    </div>
                                `;

                                if (index < completeChain.length - 1) {
                                    evolutionRowsHtml += `<div class="flecha-evolucion">→</div>`;
                                }
                            });

                            evolutionRowsHtml += `</div>`;
                        }
                        else if (preEvolution) {
                            const allEvolutionsFromParent = evolutionChain.filter(e =>
                                e.evolves_from === preEvolution.id
                            );

                            const sortedEvolutions = [...allEvolutionsFromParent].sort((a, b) =>
                                a.name.localeCompare(b.name)
                            );

                            if (sortedEvolutions.length <= 3) {
                                evolutionRowsHtml = `<div class="fila-evolucion evolucion-horizontal">`;

                                evolutionRowsHtml += `
                                    <div class="caja-evolucion otra" 
                                         data-pokemon-id="${preEvolution.id}" 
                                         data-pokemon-name="${preEvolution.name}">
                                        <img src="${preEvolution.sprite}" alt="${preEvolution.name}" class="sprite-evolucion">
                                        <div class="nombre-evolucion">${preEvolution.name}</div>
                                    </div>
                                `;

                                evolutionRowsHtml += `<div class="flecha-evolucion">→</div>`;

                                sortedEvolutions.forEach((evo, index) => {
                                    const isCurrent = evo.id === pokemon.id;
                                    evolutionRowsHtml += `
                                        <div class="caja-evolucion ${isCurrent ? 'actual' : 'otra'}" 
                                             data-pokemon-id="${evo.id}" 
                                             data-pokemon-name="${evo.name}">
                                            <img src="${evo.sprite}" alt="${evo.name}" class="sprite-evolucion">
                                            <div class="nombre-evolucion">${evo.name}</div>
                                        </div>
                                    `;
                                });

                                evolutionRowsHtml += `</div>`;
                            } else {
                                evolutionRowsHtml = `<div class="fila-evolucion">`;
                                evolutionRowsHtml += `
                                    <div class="caja-evolucion otra" 
                                         data-pokemon-id="${preEvolution.id}" 
                                         data-pokemon-name="${preEvolution.name}">
                                        <img src="${preEvolution.sprite}" alt="${preEvolution.name}" class="sprite-evolucion">
                                        <div class="nombre-evolucion">${preEvolution.name}</div>
                                    </div>
                                    <div class="flecha-evolucion">→</div>
                                `;
                                evolutionRowsHtml += `</div>`;

                                evolutionRowsHtml += `<div class="fila-evolucion fila-evolucion-paralela">`;

                                evolutionRowsHtml += `<div class="contenedor-evolucion-paralela">`;
                                sortedEvolutions.forEach(evo => {
                                    const isCurrent = evo.id === pokemon.id;
                                    evolutionRowsHtml += `
                                        <div class="caja-evolucion ${isCurrent ? 'actual' : 'otra'}" 
                                             data-pokemon-id="${evo.id}" 
                                             data-pokemon-name="${evo.name}">
                                            <img src="${evo.sprite}" alt="${evo.name}" class="sprite-evolucion">
                                            <div class="nombre-evolucion">${evo.name}</div>
                                        </div>
                                    `;
                                });
                                evolutionRowsHtml += `</div>`;
                                evolutionRowsHtml += `</div>`;
                            }
                        }
                        else if (directEvolutions.length > 0) {
                            evolutionRowsHtml = `<div class="fila-evolucion">`;
                            evolutionRowsHtml += `
                                <div class="caja-evolucion actual" 
                                     data-pokemon-id="${pokemon.id}" 
                                     data-pokemon-name="${pokemon.name}">
                                    <img src="${pokemon.sprites.front_default || ''}" alt="${pokemon.name}" class="sprite-evolucion">
                                    <div class="nombre-evolucion">${pokemon.name}</div>
                                </div>
                                <div class="flecha-evolucion">→</div>
                            `;
                            evolutionRowsHtml += `</div>`;

                            evolutionRowsHtml += `<div class="fila-evolucion fila-evolucion-paralela">`;

                            const sortedEvolutions = [...directEvolutions].sort((a, b) =>
                                a.name.localeCompare(b.name)
                            );

                            if (sortedEvolutions.length <= 4) {
                                evolutionRowsHtml += `<div class="contenedor-evolucion-paralela">`;
                                sortedEvolutions.forEach(evo => {
                                    evolutionRowsHtml += `
                                        <div class="caja-evolucion otra" 
                                             data-pokemon-id="${evo.id}" 
                                             data-pokemon-name="${evo.name}">
                                            <img src="${evo.sprite}" alt="${evo.name}" class="sprite-evolucion">
                                            <div class="nombre-evolucion">${evo.name}</div>
                                        </div>
                                    `;
                                });
                                evolutionRowsHtml += `</div>`;
                            } else {
                                evolutionRowsHtml += `<div class="contenedor-evolucion-paralela">`;
                                sortedEvolutions.slice(0, 4).forEach(evo => {
                                    evolutionRowsHtml += `
                                        <div class="caja-evolucion otra" 
                                             data-pokemon-id="${evo.id}" 
                                             data-pokemon-name="${evo.name}">
                                            <img src="${evo.sprite}" alt="${evo.name}" class="sprite-evolucion">
                                            <div class="nombre-evolucion">${evo.name}</div>
                                        </div>
                                    `;
                                });
                                evolutionRowsHtml += `</div>`;

                                if (sortedEvolutions.length > 4) {
                                    evolutionRowsHtml += `</div><div class="fila-evolucion fila-evolucion-paralela">`;
                                    evolutionRowsHtml += `<div class="contenedor-evolucion-paralela">`;
                                    sortedEvolutions.slice(4).forEach(evo => {
                                        evolutionRowsHtml += `
                                            <div class="caja-evolucion otra" 
                                                 data-pokemon-id="${evo.id}" 
                                                 data-pokemon-name="${evo.name}">
                                                <img src="${evo.sprite}" alt="${evo.name}" class="sprite-evolucion">
                                                <div class="nombre-evolucion">${evo.name}</div>
                                            </div>
                                        `;
                                    });
                                    evolutionRowsHtml += `</div>`;
                                }
                            }

                            evolutionRowsHtml += `</div>`;
                        }
                        else if (preEvolution && directEvolutions.length === 0) {
                            const backwardChain = [];
                            let current = currentEvo;

                            while (current) {
                                backwardChain.unshift(current);
                                const prev = evolutionChain.find(e => e.id === current.evolves_from);
                                if (prev) {
                                    current = prev;
                                } else {
                                    break;
                                }
                            }

                            evolutionRowsHtml = `<div class="fila-evolucion evolucion-horizontal">`;

                            backwardChain.forEach((poke, index) => {
                                const isCurrent = poke.id === pokemon.id;
                                evolutionRowsHtml += `
                                    <div class="caja-evolucion ${isCurrent ? 'actual' : 'otra'}" 
                                         data-pokemon-id="${poke.id}" 
                                         data-pokemon-name="${poke.name}">
                                        <img src="${poke.sprite}" alt="${poke.name}" class="sprite-evolucion">
                                        <div class="nombre-evolucion">${poke.name}</div>
                                    </div>
                                `;

                                if (index < backwardChain.length - 1) {
                                    evolutionRowsHtml += `<div class="flecha-evolucion">→</div>`;
                                }
                            });

                            evolutionRowsHtml += `</div>`;
                        }
                        else {
                            evolutionRowsHtml = `<div class="fila-evolucion evolucion-horizontal">`;
                            evolutionRowsHtml += `
                                <div class="caja-evolucion actual" 
                                     data-pokemon-id="${pokemon.id}" 
                                     data-pokemon-name="${pokemon.name}">
                                    <img src="${pokemon.sprites.front_default || ''}" alt="${pokemon.name}" class="sprite-evolucion">
                                    <div class="nombre-evolucion">${pokemon.name}</div>
                                </div>
                            `;
                            evolutionRowsHtml += `</div>`;
                        }

                        evolutionHtml = `
                            <div class="seccion-evolucion">
                                <div class="titulo-evolucion">CADENA DE EVOLUCIÓN</div>
                                <div class="contenedor-evolucion">
                                    ${evolutionRowsHtml}
                                </div>
                            </div>
                        `;
                    }
                }

                const isFavorited = Storage.isFavorite(pokemon.id);
                const heartButtonClass = isFavorited ? 'boton-corazon favorito' : 'boton-corazon';

                // Badge de origen (API o Cache)
                const badgeText = fromCache ? 'DESDE CACHE' : 'DESDE API';
                const badgeColor = fromCache ? 'var(--color-habilidad-normal)' : 'var(--color-accento-secundario)';
                const badgeStyle = `
                    position: absolute;
                    top: 0px;
                    right: 0px;
                    background-color: ${badgeColor};
                    color: var(--color-borde);
                    padding: 3px 8px;
                    font-size: 0.7rem;
                    font-weight: bold;
                    text-transform: uppercase;
                    z-index: 10;
                `;

                return `
                    <div class="tarjeta-pokemon">
                        <div style="${badgeStyle}">${badgeText}</div>
                        <div class="contenedor-imagen-pokemon">
                            <img src="${pokemon.sprites.front_default || ''}" alt="${pokemon.name}" class="imagen-pokemon">
                        </div>
                        <div class="informacion-pokemon">
                            <h2 class="nombre-pokemon">#${pokemon.id} ${pokemon.name}</h2>
                            <div class="contenedor-tipos">
                                ${typesHtml}
                            </div>
                            <div class="seccion-habilidades">
                                <div class="titulo-habilidades">Habilidades</div>
                                <div class="lista-habilidades">
                                    ${abilitiesHtml}
                                </div>
                            </div>
                            <div class="cuadricula-estadisticas">
                                ${statsHtml}
                            </div>
                            <div class="contenedor-boton-corazon">
                                <div class="${heartButtonClass}" data-pokemon-id="${pokemon.id}">
                                    ${isFavorited ? '❤️' : '🩶'}
                                </div>
                            </div>
                            <div class="linea-punteada"></div>
                            ${evolutionHtml}
                        </div>
                    </div>
                `;
            },

            // Plantilla para habilidades
            abilityCard: (abilityData, pokemonWithAbility = []) => {
                const abilityName = abilityData.name.toUpperCase();
                const abilityId = abilityData.id;

                const effectEntry = abilityData.effect_entries.find(e => e.language.name === 'es') ||
                    abilityData.effect_entries.find(e => e.language.name === 'en');

                let effectDescription = 'No description available';
                if (effectEntry) {
                    const fullEffect = effectEntry.effect;
                    const firstParagraph = fullEffect.split('\n')[0];
                    effectDescription = firstParagraph.length > 200 ?
                        firstParagraph.substring(0, 200) + '...' :
                        firstParagraph;
                }

                const hiddenPokemon = pokemonWithAbility.filter(p => p.is_hidden);
                const normalPokemon = pokemonWithAbility.filter(p => !p.is_hidden);

                hiddenPokemon.sort((a, b) => a.id - b.id);
                normalPokemon.sort((a, b) => a.id - b.id);

                const sortedPokemon = [...hiddenPokemon, ...normalPokemon];

                let pokemonGridHtml = '';

                sortedPokemon.forEach(pokemon => {
                    const isHidden = pokemon.is_hidden;
                    pokemonGridHtml += `
                        <div class="pokemon-con-habilidad" data-pokemon-id="${pokemon.id}" data-pokemon-name="${pokemon.name}">
                            <img src="${pokemon.sprite}" alt="${pokemon.name}" class="sprite-pokemon">
                            <div class="nombre-pokemon-habilidad">${pokemon.name}</div>
                            ${isHidden ? '<div class="insignia-oculta">(OCULTA)</div>' : ''}
                        </div>
                    `;
                });

                return `
                    <div class="tarjeta-habilidad">
                        <div class="cabecera-habilidad">
                            <h2 class="nombre-habilidad">${abilityName}</h2>
                            <div class="id-habilidad">#${abilityId}</div>
                        </div>
                        
                        <div class="linea-horizontal"></div>
                        
                        <div class="seccion-efecto">
                            <div class="caja-efecto">
                                <div class="titulo-efecto">EFECTO</div>
                                <div class="descripcion-efecto">${effectDescription}</div>
                            </div>
                        </div>
                        
                        <div class="conteo-pokemon">
                            POKÉMON CON ESTA HABILIDAD (${pokemonWithAbility.length})
                        </div>
                        
                        <div class="contenedor-pokemon-rejilla">
                            <div class="rejilla-pokemon">
                                ${pokemonGridHtml}
                            </div>
                        </div>
                    </div>
                `;
            },

            // Tarjeta para historial
            historyCard: (pokemonData) => {
                const typesHtml = pokemonData.types
                    .map(type => `<span class="etiqueta-tipo-pequena">${type}</span>`)
                    .join('');

                const isFavorited = Storage.isFavorite(pokemonData.id);
                const heartIcon = isFavorited ? '❤️' : '🩶';

                return `
                    <div class="tarjeta-historial" data-pokemon-id="${pokemonData.id}">
                        <div class="contenedor-sprite">
                            <img src="${pokemonData.sprite}" alt="${pokemonData.name}" class="sprite-historial">
                        </div>
                        <div class="contenedor-informacion-pokemon">
                            <div class="id-nombre-pokemon">#${pokemonData.id} ${pokemonData.name}</div>
                            <div class="contenedor-tipos-historial">
                                ${typesHtml}
                            </div>
                        </div>
                        <div class="contenedor-botones">
                            <div class="boton-accion boton-corazon-historial ${isFavorited ? 'favorito' : ''}" 
                                 data-action="favorite" 
                                 data-pokemon-id="${pokemonData.id}">
                                ${heartIcon}
                            </div>
                            <div class="boton-accion boton-basura" 
                                 data-action="delete" 
                                 data-pokemon-id="${pokemonData.id}">
                                🗑️
                            </div>
                        </div>
                    </div>
                `;
            },

            // Tarjeta para favoritos
            favoritesCard: (pokemonData) => {
                const typesHtml = pokemonData.types
                    .map(type => `<span class="etiqueta-tipo-pequena">${type}</span>`)
                    .join('');

                return `
                    <div class="tarjeta-historial" data-pokemon-id="${pokemonData.id}">
                        <div class="contenedor-sprite">
                            <img src="${pokemonData.sprite}" alt="${pokemonData.name}" class="sprite-historial">
                        </div>
                        <div class="contenedor-informacion-pokemon">
                            <div class="id-nombre-pokemon">#${pokemonData.id} ${pokemonData.name}</div>
                            <div class="contenedor-tipos-historial">
                                ${typesHtml}
                            </div>
                        </div>
                        <div class="contenedor-botones">
                            <div class="boton-accion boton-basura" 
                                 data-action="delete" 
                                 data-pokemon-id="${pokemonData.id}">
                                🗑️
                            </div>
                        </div>
                    </div>
                `;
            },

            // Estados vacíos
            emptyState: (message) => `
                <div class="estado-vacio">
                    ${message}
                </div>
            `,

            error: (message) => `
                <div class="mensaje-error">
                    ERROR: ${message.toUpperCase()}
                </div>
            `,

            loading: (term = '') => `
                <div class="cargando">
                    BUSCANDO "${term.toUpperCase() || 'DATOS'}"...
                </div>
            `
        };

        // Tabla simplificada de efectividad de tipos
        const typeChart = {
            normal: {
                superEffective: [],
                notVeryEffective: ['rock', 'steel'],
                noEffect: ['ghost']
            },
            fire: {
                superEffective: ['grass', 'ice', 'bug', 'steel'],
                notVeryEffective: ['fire', 'water', 'rock', 'dragon'],
                noEffect: []
            },
            water: {
                superEffective: ['fire', 'ground', 'rock'],
                notVeryEffective: ['water', 'grass', 'dragon'],
                noEffect: []
            },
            grass: {
                superEffective: ['water', 'ground', 'rock'],
                notVeryEffective: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
                noEffect: []
            },
            electric: {
                superEffective: ['water', 'flying'],
                notVeryEffective: ['electric', 'grass', 'dragon'],
                noEffect: ['ground']
            },
            ice: {
                superEffective: ['grass', 'ground', 'flying', 'dragon'],
                notVeryEffective: ['fire', 'water', 'ice', 'steel'],
                noEffect: []
            },
            fighting: {
                superEffective: ['normal', 'ice', 'rock', 'dark', 'steel'],
                notVeryEffective: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
                noEffect: ['ghost']
            },
            poison: {
                superEffective: ['grass', 'fairy'],
                notVeryEffective: ['poison', 'ground', 'rock', 'ghost'],
                noEffect: ['steel']
            },
            ground: {
                superEffective: ['fire', 'electric', 'poison', 'rock', 'steel'],
                notVeryEffective: ['grass', 'bug'],
                noEffect: ['flying']
            },
            flying: {
                superEffective: ['grass', 'fighting', 'bug'],
                notVeryEffective: ['electric', 'rock', 'steel'],
                noEffect: []
            },
            psychic: {
                superEffective: ['fighting', 'poison'],
                notVeryEffective: ['psychic', 'steel'],
                noEffect: ['dark']
            },
            bug: {
                superEffective: ['grass', 'psychic', 'dark'],
                notVeryEffective: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
                noEffect: []
            },
            rock: {
                superEffective: ['fire', 'ice', 'flying', 'bug'],
                notVeryEffective: ['fighting', 'ground', 'steel'],
                noEffect: []
            },
            ghost: {
                superEffective: ['psychic', 'ghost'],
                notVeryEffective: ['dark'],
                noEffect: ['normal']
            },
            dragon: {
                superEffective: ['dragon'],
                notVeryEffective: ['steel'],
                noEffect: ['fairy']
            },
            dark: {
                superEffective: ['psychic', 'ghost'],
                notVeryEffective: ['fighting', 'dark', 'fairy'],
                noEffect: []
            },
            steel: {
                superEffective: ['ice', 'rock', 'fairy'],
                notVeryEffective: ['fire', 'water', 'electric', 'steel'],
                noEffect: []
            },
            fairy: {
                superEffective: ['fighting', 'dragon', 'dark'],
                notVeryEffective: ['fire', 'poison', 'steel'],
                noEffect: []
            }
        };

        // 5. Manejadores de Eventos
        const handlers = {
            // Busca página

            // Maneja cambio de tipo de búsqueda
            onSearchTypeChange() {
                const searchType = htmlElements.searchTypeSelect.value;

                // Cambia placeholder según tipo
                if (searchType === 'pokemon') {
                    htmlElements.input.placeholder = 'NOMBRE O ID...';
                } else if (searchType === 'ability') {
                    htmlElements.input.placeholder = 'NOMBRE DE HABILIDAD...';
                }

                // Guarda preferencia
                localStorage.setItem('lastSearchType', searchType);

                // Enfoca el input después de cambiar
                utils.focusInput(htmlElements.input);
            },

            async onSearchSubmit(e) {
                e.preventDefault();

                if (!utils.validateInput(htmlElements.input.value)) {
                    utils.render(htmlElements.resultsContainer, templates.error('Ingresa un término de búsqueda'));
                    return;
                }

                const term = htmlElements.input.value.trim();
                const searchType = htmlElements.searchTypeSelect.value;

                utils.render(htmlElements.resultsContainer, templates.loading(term));

                try {
                    if (searchType === 'pokemon') {
                        // Busca Pokémon
                        const { pokemon, evolutionChain, fromCache } = await utils.fetchPokemonWithEvolution(term);
                        utils.render(htmlElements.resultsContainer, templates.card(pokemon, evolutionChain, fromCache));
                        this.configurarEventosTarjeta();
                    } else if (searchType === 'ability') {
                        // Busca Habilidad
                        const { ability, pokemonWithAbility } = await utils.fetchAbilityWithPokemon(term);
                        utils.render(htmlElements.resultsContainer, templates.abilityCard(ability, pokemonWithAbility, false));
                        this.configurarEventosHabilidad();
                    }
                } catch (error) {
                    utils.render(htmlElements.resultsContainer, templates.error('No se encontró resultado'));
                }
            },

            onKeyDown(e) {
                if (e.ctrlKey && e.key === 'p') {
                    e.preventDefault();
                    utils.focusInput(htmlElements.input);
                }
            },

            onFavoriteClick(e) {
                if (e.target.classList.contains('boton-corazon')) {
                    const button = e.target;
                    const pokemonId = parseInt(button.dataset.pokemonId);

                    const pokemonCard = button.closest('.tarjeta-pokemon');
                    const pokemonName = pokemonCard.querySelector('.nombre-pokemon').textContent.split(' ').slice(1).join(' ');
                    const pokemonSprite = pokemonCard.querySelector('.imagen-pokemon').src;
                    const pokemonTypes = Array.from(pokemonCard.querySelectorAll('.etiqueta-tipo')).map(badge => badge.textContent);

                    const pokemonData = {
                        id: pokemonId,
                        name: pokemonName,
                        sprite: pokemonSprite,
                        types: pokemonTypes
                    };

                    if (Storage.isFavorite(pokemonId)) {
                        Storage.removeFromFavorites(pokemonId);
                        button.textContent = '🩶';
                        button.classList.remove('favorito');
                    } else {
                        Storage.addToFavorites(pokemonData);
                        button.textContent = '❤️';
                        button.classList.add('favorito');
                    }
                }
            },

            onEvolutionBoxClick(e) {
                const evolutionBox = e.target.closest('.caja-evolucion');
                if (evolutionBox) {
                    const pokemonName = evolutionBox.dataset.pokemonName;

                    if (pokemonName) {
                        htmlElements.input.value = pokemonName;
                        htmlElements.form.dispatchEvent(new Event('submit'));
                    }
                }
            },

            onAbilityPokemonClick(e) {
                const pokemonBox = e.target.closest('.pokemon-con-habilidad');
                if (pokemonBox) {
                    const pokemonName = pokemonBox.dataset.pokemonName;

                    if (pokemonName) {
                        htmlElements.input.value = pokemonName;
                        htmlElements.form.dispatchEvent(new Event('submit'));
                    }
                }
            },

            configurarEventosTarjeta() {
                const heartButton = htmlElements.resultsContainer.querySelector('.boton-corazon');
                if (heartButton) {
                    heartButton.addEventListener('click', this.onFavoriteClick.bind(this));
                }

                const evolutionBoxes = htmlElements.resultsContainer.querySelectorAll('.caja-evolucion');
                evolutionBoxes.forEach(box => {
                    box.addEventListener('click', this.onEvolutionBoxClick.bind(this));
                });
            },

            configurarEventosHabilidad() {
                const abilityPokemon = htmlElements.resultsContainer.querySelectorAll('.pokemon-con-habilidad');
                abilityPokemon.forEach(pokemon => {
                    pokemon.addEventListener('click', this.onAbilityPokemonClick.bind(this));
                });
            },

            // Histórico página
            searchPokemon(pokemonName) {
                localStorage.setItem('lastSearch', pokemonName);
                window.location.href = 'buscar.html';
            },

            toggleFavorite(button, pokemonId) {
                const card = button.closest('.tarjeta-historial');
                const pokemonName = card.querySelector('.id-nombre-pokemon').textContent.split(' ').slice(1).join(' ');
                const pokemonSprite = card.querySelector('.sprite-historial').src;
                const pokemonTypes = Array.from(card.querySelectorAll('.etiqueta-tipo-pequena')).map(badge => badge.textContent);

                const pokemonData = {
                    id: pokemonId,
                    name: pokemonName,
                    sprite: pokemonSprite,
                    types: pokemonTypes
                };

                if (Storage.isFavorite(pokemonId)) {
                    Storage.removeFromFavorites(pokemonId);
                    button.textContent = '🩶';
                    button.classList.remove('favorito');
                } else {
                    Storage.addToFavorites(pokemonData);
                    button.textContent = '❤️';
                    button.classList.add('favorito');
                }
            },

            deleteFromHistory(pokemonId) {
                Storage.removeFromHistory(pokemonId);
                this.renderHistory();
            },

            handleHistoryButtonAction(button) {
                const action = button.dataset.action;
                const pokemonId = parseInt(button.dataset.pokemonId);

                if (action === 'favorite') {
                    this.toggleFavorite(button, pokemonId);
                } else if (action === 'delete') {
                    this.deleteFromHistory(pokemonId);
                }
            },

            renderHistory() {
                const history = Storage.getHistory();

                if (history.length === 0) {
                    utils.render(htmlElements.historyContainer, templates.emptyState('NO HAY BÚSQUEDAS RECIENTES'));
                    return;
                }

                let historyHtml = '';
                history.forEach(pokemonData => {
                    historyHtml += templates.historyCard(pokemonData);
                });

                utils.render(htmlElements.historyContainer, historyHtml);

                document.querySelectorAll('.tarjeta-historial').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('.boton-accion')) {
                            const pokemonName = card.querySelector('.id-nombre-pokemon').textContent.split(' ').slice(1).join(' ');
                            this.searchPokemon(pokemonName);
                        }
                    });
                });

                document.querySelectorAll('.boton-accion').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleHistoryButtonAction(e.currentTarget);
                    });
                });
            },

            // Favoritos página
            deleteFromFavorites(pokemonId) {
                Storage.removeFromFavorites(pokemonId);
                this.renderFavorites();
            },

            handleFavoritesButtonAction(button) {
                const action = button.dataset.action;
                const pokemonId = parseInt(button.dataset.pokemonId);

                if (action === 'delete') {
                    this.deleteFromFavorites(pokemonId);
                }
            },

            renderFavorites() {
                const favorites = Storage.getFavorites();

                if (favorites.length === 0) {
                    utils.render(htmlElements.favoritesContainer, templates.emptyState('NO HAY POKÉMON FAVORITOS'));
                    return;
                }

                let favoritesHtml = '';
                favorites.forEach(pokemonData => {
                    favoritesHtml += templates.favoritesCard(pokemonData);
                });

                utils.render(htmlElements.favoritesContainer, favoritesHtml);

                document.querySelectorAll('.tarjeta-historial').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('.boton-accion')) {
                            const pokemonName = card.querySelector('.id-nombre-pokemon').textContent.split(' ').slice(1).join(' ');
                            this.searchPokemon(pokemonName);
                        }
                    });
                });

                document.querySelectorAll('.boton-accion').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleFavoritesButtonAction(e.currentTarget);
                    });
                });
            },

            // VS batalla - Búsqueda v1
            vsState: {
                pokemon1: null,
                pokemon2: null
            },

            initVsPage() {
                const pokemon1Input = document.getElementById('pokemon1-input');
                const pokemon2Input = document.getElementById('pokemon2-input');
                const searchPokemon1Btn = document.getElementById('search-pokemon1-btn');
                const searchPokemon2Btn = document.getElementById('search-pokemon2-btn');
                const battleBtn = document.getElementById('battle-btn');
                const randomBattleBtn = document.getElementById('random-battle-btn');
                const clearBattleBtn = document.getElementById('clear-battle-btn');
                const battleResults = document.getElementById('battle-results');
                const pokemon1Container = document.getElementById('pokemon1-container');
                const pokemon2Container = document.getElementById('pokemon2-container');

                if (!pokemon1Input || !pokemon2Input || !searchPokemon1Btn || !searchPokemon2Btn || !pokemon1Container || !pokemon2Container) {
                    return;
                }

                if (battleResults) {
                    battleResults.style.display = 'none';
                }

                // Reemplaza las tarjetas de ejemplo por el estado vacío
                this.renderEmptyVsCard(pokemon1Container, 'POKÉMON 1');
                this.renderEmptyVsCard(pokemon2Container, 'POKÉMON 2');

                // Buscar Pokémon 1
                searchPokemon1Btn.addEventListener('click', () => {
                    this.searchVsPokemon(1);
                });

                // Buscar Pokémon 2
                searchPokemon2Btn.addEventListener('click', () => {
                    this.searchVsPokemon(2);
                });

                // Enter en inputs
                pokemon1Input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.searchVsPokemon(1);
                    }
                });

                pokemon2Input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.searchVsPokemon(2);
                    }
                });

                // Batalla aleatoria sencilla
                if (randomBattleBtn) {
                    randomBattleBtn.addEventListener('click', () => {
                        const maxId = 151; 
                        const randomId1 = Math.floor(Math.random() * maxId) + 1;
                        const randomId2 = Math.floor(Math.random() * maxId) + 1;

                        pokemon1Input.value = randomId1;
                        pokemon2Input.value = randomId2;

                        this.searchVsPokemon(1);
                        this.searchVsPokemon(2);
                    });
                }

                // Limpiar batalla
                if (clearBattleBtn) {
                    clearBattleBtn.addEventListener('click', () => {
                        pokemon1Input.value = '';
                        pokemon2Input.value = '';
                        this.vsState.pokemon1 = null;
                        this.vsState.pokemon2 = null;
                        this.renderEmptyVsCard(pokemon1Container, 'POKÉMON 1');
                        this.renderEmptyVsCard(pokemon2Container, 'POKÉMON 2');
                        if (battleResults) {
                            battleResults.style.display = 'none';
                        }
                        if (battleBtn) {
                            battleBtn.disabled = true;
                        }
                    });
                }

                if (battleBtn) {
                    battleBtn.disabled = true;
                    battleBtn.addEventListener('click', () => {
                        if (!this.vsState.pokemon1 || !this.vsState.pokemon2) {
                            alert('Primero busca los dos Pokémon');
                            return;
                        }
                        this.renderBattleResults();
                    });
                }
            },

            updateBattleButton() {
                const battleBtn = document.getElementById('battle-btn');
                if (!battleBtn) return;
                battleBtn.disabled = !(this.vsState.pokemon1 && this.vsState.pokemon2);
            },

            renderEmptyVsCard(container, title) {
                const template = document.getElementById('empty-vs-template');
                if (!template || !container) return;

                const fragment = template.content.cloneNode(true);
                const titleElement = fragment.querySelector('p');
                if (titleElement) {
                    titleElement.textContent = `BUSCA ${title}`;
                }

                container.innerHTML = '';
                container.appendChild(fragment);
            },

            async searchVsPokemon(slot) {
                const inputId = slot === 1 ? 'pokemon1-input' : 'pokemon2-input';
                const containerId = slot === 1 ? 'pokemon1-container' : 'pokemon2-container';

                const input = document.getElementById(inputId);
                const container = document.getElementById(containerId);

                if (!input || !container) return;

                const query = input.value.trim();
                if (!query) {
                    alert('Ingresa un nombre o número de Pokémon');
                    return;
                }

                container.innerHTML = '<div class="loading">BUSCANDO POKÉMON...</div>';

                try {
                    const pokemon = await utils.fetchPokemon(query);
                    const fromCache = !!pokemon.fromCache;

                    this.renderVsPokemon(slot, pokemon, fromCache);

                    if (slot === 1) {
                        this.vsState.pokemon1 = pokemon;
                    } else {
                        this.vsState.pokemon2 = pokemon;
                    }

                    this.updateBattleButton();
                } catch (error) {
                    console.error('Error buscando Pokémon para VS:', error);
                    container.innerHTML = '<div class="error">NO SE ENCONTRÓ EL POKÉMON</div>';

                    if (slot === 1) {
                        this.vsState.pokemon1 = null;
                    } else {
                        this.vsState.pokemon2 = null;
                    }

                    this.updateBattleButton();
                }
            },

            renderVsPokemon(slot, pokemon, fromCache = false) {
                const containerId = slot === 1 ? 'pokemon1-container' : 'pokemon2-container';
                const container = document.getElementById(containerId);
                const template = document.getElementById('vs-card-template');

                if (!container || !template) return;

                const fragment = template.content.cloneNode(true);
                const card = fragment.querySelector('.vs-card');

                // Sprite
                const spriteImg = card.querySelector('.vs-sprite');
                spriteImg.src = pokemon.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
                spriteImg.alt = pokemon.name;

                // Nombre e ID
                const nameEl = card.querySelector('.vs-name');
                const idEl = card.querySelector('.vs-id');
                if (nameEl) nameEl.textContent = pokemon.name.toUpperCase();
                if (idEl) idEl.textContent = `#${pokemon.id.toString().padStart(3, '0')}`;

                // Tipos
                const typesContainer = card.querySelector('.vs-types');
                if (typesContainer) {
                    typesContainer.innerHTML = '';
                    pokemon.types.forEach(t => {
                        const span = document.createElement('span');
                        span.className = `type-badge type-${t.type.name}`;
                        span.textContent = t.type.name.toUpperCase();
                        typesContainer.appendChild(span);
                    });
                }

                // Estadísticas (barras)
                const statsContainer = card.querySelector('.vs-stats');
                if (statsContainer) {
                    statsContainer.innerHTML = '';
                    pokemon.stats.forEach(stat => {
                        const label = stat.stat.name.toUpperCase().replace('-', ' ');
                        const value = stat.base_stat;
                        const percent = Math.min(value, 100);

                        const item = document.createElement('div');
                        item.className = 'vs-stat-item';
                        item.innerHTML = `
                            <div class="vs-stat-label">
                                <span>${label}</span>
                                <span>${value}</span>
                            </div>
                            <div class="vs-stat-bar-container">
                                <div class="vs-stat-bar" style="width: ${percent}%"></div>
                                <span class="vs-stat-number">${value}</span>
                            </div>
                        `;

                        statsContainer.appendChild(item);
                    });
                }

                // Badge API / Caché
                const badge = card.querySelector('.badge');
                if (badge) {
                    if (fromCache) {
                        badge.textContent = 'DESDE CACHÉ';
                        badge.classList.remove('badge-api');
                        badge.classList.add('badge-cache');
                    } else {
                        badge.textContent = 'DESDE API';
                        badge.classList.remove('badge-cache');
                        badge.classList.add('badge-api');
                    }
                }

                // Datos base para favoritos (VS)
                const pokemonData = {
                    id: pokemon.id,
                    name: pokemon.name.toUpperCase(),
                    sprite: spriteImg.src,
                    types: pokemon.types.map(t => t.type.name.toUpperCase())
                };

                // Favorito (icono pequeño en la cabecera)
                const favoriteBtn = card.querySelector('.vs-favorite-btn');
                if (favoriteBtn) {
                    const icon = favoriteBtn.querySelector('i');
                    const isFav = Storage.isFavorite(pokemon.id);
                    if (isFav) {
                        icon.classList.add('favorite');
                    } else {
                        icon.classList.remove('favorite');
                    }

                    favoriteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();

                        if (Storage.isFavorite(pokemon.id)) {
                            Storage.removeFromFavorites(pokemon.id);
                            icon.classList.remove('favorite');
                            alert('Eliminado de favoritos');
                        } else {
                            Storage.addToFavorites(pokemonData);
                            icon.classList.add('favorite');
                            alert('Agregado a favoritos');
                        }
                    });
                }

                // Botón de me gusta al estilo del buscador
                const bigHeart = card.querySelector('.boton-corazon-vs');
                if (bigHeart) {
                    bigHeart.dataset.pokemonId = pokemon.id;

                    const isFav = Storage.isFavorite(pokemon.id);
                    if (isFav) {
                        bigHeart.classList.add('favorito');
                        bigHeart.textContent = '❤️';
                    } else {
                        bigHeart.classList.remove('favorito');
                        bigHeart.textContent = '🩶';
                    }

                    bigHeart.addEventListener('click', (e) => {
                        e.stopPropagation();

                        if (Storage.isFavorite(pokemon.id)) {
                            Storage.removeFromFavorites(pokemon.id);
                            bigHeart.classList.remove('favorito');
                            bigHeart.textContent = '🩶';
                            alert('Eliminado de favoritos');
                        } else {
                            Storage.addToFavorites(pokemonData);
                            bigHeart.classList.add('favorito');
                            bigHeart.textContent = '❤️';
                            alert('Agregado a favoritos');
                        }
                    });
                }

                container.innerHTML = '';
                container.appendChild(fragment);
            },

            // VS Battle - Cálculo de batalla

            getTypeEffectiveness(attackType, defendType) {
                const info = typeChart[attackType] || null;
                if (!info) return 1;

                if (info.noEffect && info.noEffect.includes(defendType)) return 0;
                if (info.superEffective && info.superEffective.includes(defendType)) return 2;
                if (info.notVeryEffective && info.notVeryEffective.includes(defendType)) return 0.5;
                return 1;
            },

            calculateTypeMultiplier(attacker, defender) {
                const attackerTypes = attacker.types.map(t => t.type.name);
                const defenderTypes = defender.types.map(t => t.type.name);

                // Usamos el primer tipo del atacante como tipo principal del ataque
                const mainAttackType = attackerTypes[0];
                let multiplier = 1;

                defenderTypes.forEach(defType => {
                    multiplier *= this.getTypeEffectiveness(mainAttackType, defType);
                });

                return { attackType: mainAttackType, multiplier };
            },

            calculateBaseStats(pokemon) {
                return pokemon.stats.reduce((sum, stat) => sum + (stat.base_stat || 0), 0);
            },

            buildEffectivenessItem(attackerName, defenderName, attackType, multiplier, grid) {
                if (!grid) return;

                const item = document.createElement('div');

                let intensityClass = 'normal';
                let description;
                if (multiplier === 0) {
                    intensityClass = 'weak';
                    description = `${attackType.toUpperCase()} no tiene efecto contra ${defenderName.toUpperCase()}`;
                } else if (multiplier < 1) {
                    intensityClass = 'weak';
                    description = `${attackType.toUpperCase()} es poco efectivo contra ${defenderName.toUpperCase()}`;
                } else if (multiplier > 1) {
                    intensityClass = 'super';
                    description = `${attackType.toUpperCase()} es súper efectivo contra ${defenderName.toUpperCase()}`;
                } else {
                    intensityClass = 'normal';
                    description = `${attackType.toUpperCase()} tiene efectividad normal contra ${defenderName.toUpperCase()}`;
                }

                item.className = `effectiveness-item ${intensityClass}`;
                item.innerHTML = `
                    <div>
                        <strong>${attackerName.toUpperCase()}</strong> vs <strong>${defenderName.toUpperCase()}</strong>: x${multiplier.toFixed(2)}<br>
                        <small>${description}</small>
                    </div>
                    <div class="effectiveness-multiplier">${multiplier.toFixed(2)}×</div>
                `;

                grid.appendChild(item);
            },

            renderBattleResults() {
                const pokemon1 = this.vsState.pokemon1;
                const pokemon2 = this.vsState.pokemon2;
                if (!pokemon1 || !pokemon2) return;

                const battleResults = document.getElementById('battle-results');
                const template = document.getElementById('battle-results-template');
                if (!battleResults || !template) return;

                const fragment = template.content.cloneNode(true);

                const total1 = this.calculateBaseStats(pokemon1);
                const total2 = this.calculateBaseStats(pokemon2);

                const typeInfo1 = this.calculateTypeMultiplier(pokemon1, pokemon2);
                const typeInfo2 = this.calculateTypeMultiplier(pokemon2, pokemon1);

                const finalScore1 = total1 * typeInfo1.multiplier;
                const finalScore2 = total2 * typeInfo2.multiplier;

                // Determinar ganador o empate
                const winnerSection = fragment.querySelector('.winner-section');
                const winnerNameEl = fragment.querySelector('.winner-name');
                const winnerScoreEl = fragment.querySelector('.winner-score');

                if (Math.abs(finalScore1 - finalScore2) < 0.01) {
                    if (winnerSection) winnerSection.classList.add('tie');
                    if (winnerNameEl) winnerNameEl.textContent = 'EMPATE';
                    if (winnerScoreEl) winnerScoreEl.textContent = `Puntuación: ${finalScore1.toFixed(1)} vs ${finalScore2.toFixed(1)}`;
                } else if (finalScore1 > finalScore2) {
                    if (winnerNameEl) winnerNameEl.textContent = pokemon1.name.toUpperCase();
                    if (winnerScoreEl) winnerScoreEl.textContent = `Puntuación: ${finalScore1.toFixed(1)}`;
                } else {
                    if (winnerNameEl) winnerNameEl.textContent = pokemon2.name.toUpperCase();
                    if (winnerScoreEl) winnerScoreEl.textContent = `Puntuación: ${finalScore2.toFixed(1)}`;
                }

                // Tarjetas de puntuación izquierda/derecha
                const scoreCards = fragment.querySelectorAll('.score-card');
                if (scoreCards.length >= 2) {
                    const leftCard = scoreCards[0];
                    const rightCard = scoreCards[1];

                    const leftName = leftCard.querySelector('.score-name');
                    const leftValue = leftCard.querySelector('.score-value');
                    const leftBreakdown = leftCard.querySelector('.score-breakdown');

                    const rightName = rightCard.querySelector('.score-name');
                    const rightValue = rightCard.querySelector('.score-value');
                    const rightBreakdown = rightCard.querySelector('.score-breakdown');

                    if (leftName) leftName.textContent = pokemon1.name.toUpperCase();
                    if (leftValue) leftValue.textContent = finalScore1.toFixed(1);
                    if (leftBreakdown) {
                        leftBreakdown.innerHTML = `
                            <div>Stats: ${total1}</div>
                            <div>× Efectividad: ${typeInfo1.multiplier.toFixed(2)}</div>
                        `;
                    }

                    if (rightName) rightName.textContent = pokemon2.name.toUpperCase();
                    if (rightValue) rightValue.textContent = finalScore2.toFixed(1);
                    if (rightBreakdown) {
                        rightBreakdown.innerHTML = `
                            <div>Stats: ${total2}</div>
                            <div>× Efectividad: ${typeInfo2.multiplier.toFixed(2)}</div>
                        `;
                    }
                }

                // Ventajas de tipo
                const effectivenessGrid = fragment.querySelector('.effectiveness-grid');
                if (effectivenessGrid) {
                    effectivenessGrid.innerHTML = '';
                    this.buildEffectivenessItem(
                        pokemon1.name,
                        pokemon2.name,
                        typeInfo1.attackType,
                        typeInfo1.multiplier,
                        effectivenessGrid
                    );
                    this.buildEffectivenessItem(
                        pokemon2.name,
                        pokemon1.name,
                        typeInfo2.attackType,
                        typeInfo2.multiplier,
                        effectivenessGrid
                    );
                }

                battleResults.innerHTML = '';
                battleResults.appendChild(fragment);
                battleResults.style.display = 'block';
                battleResults.scrollIntoView({ behavior: 'smooth' });
            }
        };

        // 6. Inicialización (API Pública)
        return {
            init() {
                const currentPage = window.location.pathname.split('/').pop();

                switch (currentPage) {
                    case 'buscar.html':
                    case '':
                    case 'index.html':
                        if (htmlElements.form) {
                            // Configura select de tipo de búsqueda
                            if (htmlElements.searchTypeSelect) {
                                htmlElements.searchTypeSelect.addEventListener('change', handlers.onSearchTypeChange.bind(handlers));

                                // Restaura última preferencia de búsqueda
                                const lastSearchType = localStorage.getItem('lastSearchType') || 'pokemon';
                                htmlElements.searchTypeSelect.value = lastSearchType;

                                // Llama al handler para actualizar placeholder
                                handlers.onSearchTypeChange();
                            }

                            // Configura formulario
                            htmlElements.form.addEventListener('submit', handlers.onSearchSubmit.bind(handlers));
                            document.addEventListener('keydown', handlers.onKeyDown);
                            utils.focusInput(htmlElements.input);
                        }
                        break;
                    case 'historico.html':
                        if (htmlElements.historyContainer) {
                            handlers.renderHistory();
                        }
                        break;
                    case 'favoritos.html':
                        if (htmlElements.favoritesContainer) {
                            handlers.renderFavorites();
                        }
                        break;
                    case 'vs.html':
                        handlers.initVsPage();
                        break;
                }
            }
        };
    })();

    // Ejecuta la aplicación
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
})();