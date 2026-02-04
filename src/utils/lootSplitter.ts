
export interface PlayerData {
    name: string;
    balance: number;
    damage: number;
    healing: number;
    // Extra properties for calculation
    originalBalance?: number;
    extraExpenses?: number;
    isRemoved?: boolean;
}

export interface Transfer {
    from: string;
    to: string;
    amount: number;
}

export interface SplitResult {
    totalProfit: number;
    profitPerPerson: number;
    transfers: Transfer[];
    sessionDate: string;
    sessionDuration: string;
    players: PlayerData[];
    formatted: {
        totalProfit: string;
        profitPerPerson: string;
    };
}

export class LootSplitter {
    /**
     * Core logic for parsing and calculating loot splits.
     * Validates if the text looks like a valid Tibia Party Hunt Analyser log
     */
    static isValidLog(text: string): boolean {
        if (!text || text.length < 50) return false;
        const required = ["Balance", "Supplies", "Loot", "Session data", "Loot Type"];
        return required.every(keyword => text.includes(keyword));
    }

    /**
     * Extracts the session date (YYYY-MM-DD)
     */
    static findSessionDate(data: string): string {
        // Usually "Session data: From 2023-10-27, 20:00:00 to 2023-10-27, 22:00:00"
        // The original code uses substring(19, 29). We'll try to be robust.
        const match = data.match(/From\s+(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : "Unknown Date";
    }

    /**
     * Extracts the session duration (HH:mm)
     */
    static findSessionDuration(data: string): string {
        const index = data.indexOf("Session: ");
        if (index === -1) return "00:00";
        // Original: return data.substring(index + 9, index + 14);
        // Let's verify format
        const substr = data.substring(index + 9, index + 14);
        if (/^\d{2}:\d{2}$/.test(substr)) return substr;
        return "00:00";
    }

    /**
   * Parses the raw log into a list of PlayerData objects
   */
    static parsePlayers(data: string): PlayerData[] {
        const players: PlayerData[] = [];

        // Normalize line endings
        const lines = data.split(/\r?\n/);

        // Find where the global session info ends
        // Usually extracting everything after the first "Balance:" block which is global
        // But logs have "Loot Type:", "Supplies:", "Balance:" at top.

        let buffer: string[] = [];
        let processingPlayers = false;

        // Strategy: Iterate lines. 
        // If line starts with "Loot Type:" or "Session:" or "From ", it's header.
        // The Global Balance line usually looks like "Balance: 15,272,040" (no indentation or start of line)
        // Players start AFTER the global Balance line.

        let headerBalanceFound = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]; // Keep original for indentation check?
            const trimmed = line.trim();

            if (!trimmed) continue;

            // Check for global balance to start player processing
            // Global stats usually come in a block. The last one is Balance.
            // After that, player names appear.
            if (!processingPlayers) {
                if (trimmed.startsWith("Balance:") && !headerBalanceFound) {
                    headerBalanceFound = true;
                    processingPlayers = true;
                }
                continue;
            }

            // We are in player section.
            // Player name is a line that does NOT start with reserved keywords (Loot, Supplies, Balance, Damage, Healing, Upgrading...)
            // AND is likely followed by "Loot:" indented line?
            // Actually, looking at the log:
            // "Ginn Ho"
            // "\tLoot: ..."

            // So if a line does NOT have "Loot:", "Balance:", "Supplies:", "Damage:", "Healing:" keywords, it's a name.
            const isStatLine = /^(Loot|Supplies|Balance|Damage|Healing|Upgrading)/.test(trimmed);

            if (!isStatLine) {
                // It's a new player!
                // Parse the PREVIOUS player if exists in buffer
                if (buffer.length > 0) {
                    players.push(this.parseSinglePlayerBlock(buffer));
                    buffer = [];
                }
                buffer.push(trimmed); // Name
            } else {
                // It's a stat line for current player
                buffer.push(trimmed);
            }
        }

        // Push last player
        if (buffer.length > 0) {
            players.push(this.parseSinglePlayerBlock(buffer));
        }

        return players;
    }

    private static parseSinglePlayerBlock(lines: string[]): PlayerData {
        // Line 0 is Name
        let name = lines[0];

        // Remove " (Leader)" from name if present
        name = name.replace(" (Leader)", "").trim();

        let balance = 0;
        let damage = 0;
        let healing = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith("Balance:")) {
                balance = parseInt(line.replace("Balance:", "").replace(/,/g, "").trim(), 10);
            } else if (line.startsWith("Damage:")) {
                damage = parseInt(line.replace("Damage:", "").replace(/,/g, "").trim(), 10);
            } else if (line.startsWith("Healing:")) {
                healing = parseInt(line.replace("Healing:", "").replace(/,/g, "").trim(), 10);
            }
        }

        return {
            name,
            balance,
            originalBalance: balance,
            damage,
            healing
        };
    }

    /**
     * Calculates the split transfers
     */
    static calculate(players: PlayerData[]): SplitResult {
        // Filter out removed players
        const activePlayers = players.filter(p => !p.isRemoved);
        const numPlayers = activePlayers.length;

        if (numPlayers === 0) {
            return {
                totalProfit: 0,
                profitPerPerson: 0,
                transfers: [],
                sessionDate: "",
                sessionDuration: "",
                players: [],
                formatted: { totalProfit: "0", profitPerPerson: "0" }
            };
        }

        // Calculate Total Profit (Sum of balances - usually profit total)
        let totalProfit = 0;
        activePlayers.forEach(p => {
            // Recalculate balance with extra expenses if any
            // In ExtraExpenses mode, we subtract expense from total profit AND player balance
            // But here we assume 'balance' passed in is already adjusted or we adjust it now?
            // Let's stick to the ported logic: 
            // "total_profit = total_profit - player_extra_expense"
            // "player.balance = player.balance - player_extra_expense"

            // If we implement extra expenses, we should modify the player.balance BEFORE calling this, 
            // OR handle it here if we add extraExpenses field to PlayerData.
            if (p.extraExpenses) {
                p.balance = (p.originalBalance || 0) - p.extraExpenses;
            } else if (p.originalBalance !== undefined) {
                p.balance = p.originalBalance;
            }

            totalProfit += p.balance;
        });

        const profitPerPerson = totalProfit / numPlayers;

        // Calculate outstanding
        // "profit_per_person - player_balance"
        // If Positive: Player RECEIVES money (paid too much waste or got little loot)
        // If Negative: Player PAYS money (got too much loot)
        // WAIT! The original logic says:
        // oustanding_payment = profit_per_person - player.balance

        // Example:
        // P1 Balance: 1000 (Loot)
        // P2 Balance: 0
        // Total: 1000. Per Person: 500.
        // P1 Outstanding: 500 - 1000 = -500. (Negative = Has to Pay?)
        // P2 Outstanding: 500 - 0 = +500. (Positive = Has to Receive?)

        // Who to pay logic:
        // if (outstanding < 0) -> This player needs to pay someone.

        interface PlayerOutstanding {
            name: string;
            balance: number; // outstanding
        }

        const outstanding: PlayerOutstanding[] = activePlayers.map(p => ({
            name: p.name,
            balance: profitPerPerson - p.balance
        }));



        // Refined Loop based on Original Source exactly:
        // The original source iterates I (debtors). Inside, while debt > 5, iterates J (creditors).
        // I need to replicate that exactly.

        // Reset transfers for the exact implementation
        const realTransfers: Transfer[] = [];
        const tempOutstanding = activePlayers.map(p => ({
            name: p.name,
            balance: profitPerPerson - p.balance
        }));

        for (let i = 0; i < numPlayers; i++) {
            if (tempOutstanding[i].balance < 0) {
                while (Math.abs(tempOutstanding[i].balance) > 5) {
                    for (let j = 0; j < numPlayers; j++) {
                        if (tempOutstanding[j].balance > 0) {
                            const debtorAmount = Math.abs(tempOutstanding[i].balance);
                            const creditorAmount = tempOutstanding[j].balance;

                            if (creditorAmount > debtorAmount) {
                                tempOutstanding[j].balance -= debtorAmount;

                                realTransfers.push({
                                    from: tempOutstanding[i].name,
                                    to: tempOutstanding[j].name,
                                    amount: Math.round(debtorAmount)
                                });

                                tempOutstanding[i].balance = 0;
                            } else {
                                // Pay all creditor needs
                                tempOutstanding[i].balance += creditorAmount; // reduces debt (negative + positive)

                                realTransfers.push({
                                    from: tempOutstanding[i].name,
                                    to: tempOutstanding[j].name,
                                    amount: Math.round(creditorAmount)
                                });

                                tempOutstanding[j].balance = 0;
                            }
                        }
                    }
                    // Determine if loop is stuck or finished
                    if (Math.abs(tempOutstanding[i].balance) <= 5) break;
                    // Warning: If total sum is not zero, this could loop.
                    // Assuming raw data creates a zero-sum game (Total Profit - Sum(Balances) = 0).
                    // Floating point safety:
                    if (realTransfers.length > numPlayers * numPlayers) break;
                }
            }
        }

        // Calculate extras
        const damageSplit = this.calculateDamageSplit(activePlayers);
        const sessionDuration = this.checkDuration(players) || "00:00"; // Need to pass players or data?
        // We don't have duration string inside 'players', we need to pass it or store it?
        // calculate() receives players[]. We need duration.
        // Let's change calculate signature or just formatting helper?
        // The previous implementation of index.ts extracted duration separately.
        // let's create a stand-alone helper or pass duration to calculate.

        // For now, index.ts calls findSessionDuration separately.
        // But we need profitPerHour inside the Result or computed outside.
        // Let's return the numeric profitPerPerson and let index.ts use formatters?
        // Or simpler: add static helpers and use them in index.ts.

        return {
            totalProfit,
            profitPerPerson,
            transfers: realTransfers.filter(t => t.amount > 0),
            sessionDate: "",
            sessionDuration: "",
            players: activePlayers,
            formatted: {
                totalProfit: this.formatNumber(totalProfit),
                profitPerPerson: this.formatNumber(profitPerPerson)
            }
        };
    }

    // Helper to extract duration from raw global log if needed, but here we process players.
    // We'll add static helpers for the other stats to be called from index.ts

    static calculateDamageSplit(players: PlayerData[]): string {
        const totalDamage = players.reduce((acc, p) => acc + p.damage, 0);
        if (totalDamage === 0) return "";

        // Sort by damage desc
        const sorted = [...players].sort((a, b) => b.damage - a.damage);

        return sorted.map(p => {
            const pct = ((p.damage / totalDamage) * 100).toFixed(1);
            return `${p.name} - ${pct}%`;
        }).join(', ');
    }

    static calculateProfitPerHour(profitPerPerson: number, duration: string): string {
        // Duration format "HH:mm" or "HH:mmh"
        const clean = duration.replace('h', '').trim();
        const parts = clean.split(':').map(Number);
        if (parts.length !== 2) return "0";

        const hours = parts[0] + (parts[1] / 60);
        if (hours === 0) return "0";

        const profitHour = profitPerPerson / hours;
        return this.formatNumber(profitHour);
    }

    // Check internal method usage or remove if legacy
    private static checkDuration(players: any): string { return ""; } // Placeholder

    static formatNumber(num: number): string {
        const abs = Math.abs(num);
        const sign = num < 0 ? "-" : "";
        if (abs > 1000000) return `${sign}${(abs / 1000000).toFixed(2)}kk`;
        if (abs > 1000) return `${sign}${Math.round(abs / 1000)}k`;
        return `${sign}${Math.round(abs)} gp`;
    }
}
