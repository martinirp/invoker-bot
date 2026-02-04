
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
        // 1. Remove header until first "Balance:" to clean up Leader/Session info
        // But we need to keep the structure. The original code does:
        // remove_first_section -> removes the Total Balance line to avoid confusion.

        let workingData = data;

        // Remove the Total Balance/Loot/Supplies section usually at the top
        // "Balance: 1,234,567 Loot: ..." (The aggregate)
        const firstBalance = workingData.indexOf("Balance: ");
        if (firstBalance !== -1) {
            const rest = workingData.substring(firstBalance + 9);
            const spaceIndex = rest.indexOf(" ");
            const totalBalanceDuration = rest.substring(0, spaceIndex); // e.g., "1,200,000"

            // We skip this first section to avoid counting it as a player
            // The original code logic for 'remove_first_section'
            const sub1 = workingData.substring(firstBalance + 9);
            const index2 = sub1.indexOf(" ");
            const sub2 = sub1.substring(0, index2);
            workingData = sub1.substring(sub2.length + 1);
        }

        // Now workingData contains the list of players
        // Format: Name Loot: ... Supplies: ... Balance: ... Damage: ... Healing: ...
        // We can split by "Loot:" to find names? Or regex?

        // Original code: count occurrences of "Balance" to find NumPlayers
        const numPlayers = (workingData.match(/Balance/g) || []).length;

        const players: PlayerData[] = [];
        let currentText = workingData;

        for (let i = 0; i < numPlayers; i++) {
            // Find Name (Text before "Loot:")
            const lootIndex = currentText.indexOf("Loot:");
            if (lootIndex === -1) break;

            let name = currentText.substring(0, lootIndex).trim();

            // Find Balance
            const balanceIndex = currentText.indexOf("Balance: ");
            const damageIndex = currentText.indexOf("Damage: ");

            if (balanceIndex === -1 || damageIndex === -1) break;

            let balanceStr = currentText.substring(balanceIndex + 9, damageIndex).trim();
            balanceStr = balanceStr.replace(/,/g, ""); // Remove commas
            const balance = parseInt(balanceStr, 10);

            // Find Damage
            const healingIndex = currentText.indexOf("Healing: ");
            let damageStr = currentText.substring(damageIndex + 8, healingIndex).trim();
            damageStr = damageStr.replace(/,/g, "");
            const damage = parseInt(damageStr, 10);

            // Find Healing
            // Healing is usually followed by new player name or end of string?
            // In parse logic: "data = data.substring(index_healing + 9); index_space = data.indexOf(" "); data = data.substring(index_space + 1);"
            let healingEndIndex = healingIndex + 9;
            // We need to cut to next iteration

            const restAfterHealing = currentText.substring(healingIndex + 9);
            const spaceAfterHealing = restAfterHealing.indexOf(" ");

            let healingStr = restAfterHealing.substring(0, spaceAfterHealing).trim();
            healingStr = healingStr.replace(/,/g, "");
            const healing = parseInt(healingStr, 10) || 0;

            players.push({
                name,
                balance,
                originalBalance: balance,
                damage: damage || 0,
                healing: healing
            });

            // Advance text
            currentText = restAfterHealing.substring(spaceAfterHealing + 1);
        }

        return players;
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

        const transfers: Transfer[] = [];

        // Greedy matching
        for (let i = 0; i < numPlayers; i++) {
            const debtor = outstanding[i];

            // If balance < 0, they retain too much profit, so they must PAY
            if (debtor.balance < 0) {

                // While they still owe money (> 5 gp tolerance)
                while (Math.abs(debtor.balance) > 5) {

                    // Find a creditor
                    for (let j = 0; j < numPlayers; j++) {
                        const creditor = outstanding[j];

                        if (creditor.balance > 0) {
                            const amountOwed = Math.abs(debtor.balance);
                            const amountReceivable = creditor.balance;

                            if (amountReceivable > amountOwed) {
                                // Creditor can accept full payment
                                transfers.push({
                                    from: debtor.name,
                                    to: creditor.name,
                                    amount: Math.round(amountOwed)
                                });

                                creditor.balance -= amountOwed;
                                debtor.balance = 0;
                            } else {
                                // Creditor takes what they can get, debtor still owes
                                transfers.push({
                                    from: debtor.name,
                                    to: creditor.name,
                                    amount: Math.round(amountReceivable)
                                });

                                debtor.balance += amountReceivable; // (it was negative, so adding makes it closer to 0)
                                creditor.balance = 0;
                            }
                        }
                    }
                    // Break if no creditors left (shouldn't happen if math is right) or floating point issues
                    if (Math.abs(debtor.balance) < 5) break;
                    // Safety break to prevent infinite loops if sum != 0
                    // But here we just follow the loop structure
                    break; // The inner for-loop finds matches. If we iterate all J and verify logic... 
                    // ACTUALLY the original logic has nested loop structure correctly.
                    // My translation of "while" needs to ensure 'j' resets or we just re-scan.
                }
            }
        }

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

    static formatNumber(num: number): string {
        const abs = Math.abs(num);
        const sign = num < 0 ? "-" : "";
        if (abs > 1000000) return `${sign}${(abs / 1000000).toFixed(2)}kk`;
        if (abs > 1000) return `${sign}${Math.round(abs / 1000)}k`;
        return `${sign}${Math.round(abs)} gp`;
    }
}
