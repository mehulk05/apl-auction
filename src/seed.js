'use strict';

const DEFAULT_SETTINGS = {
  auctionName: 'Premier League Auction 2026',
  startingPurse: 75,
  minSquad: 11,
  maxSquad: 14,
  bidIncrement: 1,
  currency: 'Cr',
  // 'corrected' -> reserve for the players still needed AFTER this purchase (mathematically right)
  // 'spec'      -> literal spec formula (minSquad - currentSquadSize); reserves one player too many
  reserveMode: 'corrected',
  allowUnsoldRound: true,
  enableRandomPlayer: true,
  enableRandomCategory: true,
  autoBackup: true,
  showTeamPursePublicly: true,
  showMaxBidToOwners: true,
  showAuctionHistory: true,
  enableProjectorMode: true,
};

const DEFAULT_CATEGORIES = [
  { name: 'A+', basePrice: 5 },
  { name: 'A', basePrice: 3 },
  { name: 'B+', basePrice: 2 },
  { name: 'B', basePrice: 1 },
];

const DEFAULT_TEAMS = [
  { id: 'T001', name: 'Warriors', owner: 'Mehul Kothari', color: '#e8443a' },
  { id: 'T002', name: 'Titans', owner: 'Rohit Desai', color: '#1f6fd0' },
  { id: 'T003', name: 'Super Kings', owner: 'Nikhil Jain', color: '#f5c518' },
  { id: 'T004', name: 'Royals', owner: 'Aarti Menon', color: '#d6408e' },
  { id: 'T005', name: 'Challengers', owner: 'Sameer Shaikh', color: '#2fa36b' },
  { id: 'T006', name: 'Capitals', owner: 'Priya Nair', color: '#7b52d3' },
];

// 64 players -> A+ x8, A x16, B+ x20, B x20
// [name, primaryCategory, role, secondaryCategory]
const RAW_PLAYERS = [
  ['Rahul Sharma', 'A+', 'Batsman', 'A'],
  ['Arjun Mehta', 'A+', 'All-Rounder', ''],
  ['Kunal Verma', 'A+', 'Bowler', 'A'],
  ['Devraj Singh', 'A+', 'Batsman', ''],
  ['Yash Kulkarni', 'A+', 'All-Rounder', 'A'],
  ['Imran Qureshi', 'A+', 'Bowler', ''],
  ['Siddharth Rao', 'A+', 'Wicket-Keeper', 'A'],
  ['Nitin Chauhan', 'A+', 'Batsman', ''],

  ['Amit Patel', 'A', 'All-Rounder', 'B+'],
  ['Rohan Shah', 'A', 'Batsman', ''],
  ['Akash Pillai', 'A', 'Bowler', 'B+'],
  ['Manav Trivedi', 'A', 'All-Rounder', ''],
  ['Faisal Khan', 'A', 'Bowler', 'B+'],
  ['Harsh Bhatt', 'A', 'Batsman', ''],
  ['Vivek Nambiar', 'A', 'Wicket-Keeper', 'B+'],
  ['Tarun Joshi', 'A', 'All-Rounder', ''],
  ['Zaid Ansari', 'A', 'Bowler', 'B+'],
  ['Pranav Iyer', 'A', 'Batsman', ''],
  ['Gaurav Saxena', 'A', 'All-Rounder', 'B+'],
  ['Aditya Kamat', 'A', 'Bowler', ''],
  ['Naveen Reddy', 'A', 'Batsman', 'B+'],
  ['Sahil Merchant', 'A', 'Wicket-Keeper', ''],
  ['Rizwan Sheikh', 'A', 'All-Rounder', 'B+'],
  ['Dhruv Bansal', 'A', 'Bowler', ''],

  ['Jay Shah', 'B+', 'Bowler', 'B'],
  ['Karan Solanki', 'B+', 'Batsman', ''],
  ['Omkar Deshmukh', 'B+', 'All-Rounder', 'B'],
  ['Sanjay Thakur', 'B+', 'Bowler', ''],
  ['Ritesh Gupta', 'B+', 'Batsman', 'B'],
  ['Anil Kadam', 'B+', 'Wicket-Keeper', ''],
  ['Mohit Rathi', 'B+', 'All-Rounder', 'B'],
  ['Suresh Yadav', 'B+', 'Bowler', ''],
  ['Parth Vora', 'B+', 'Batsman', 'B'],
  ['Aniket Sawant', 'B+', 'All-Rounder', ''],
  ['Bilal Momin', 'B+', 'Bowler', 'B'],
  ['Chetan Prabhu', 'B+', 'Batsman', ''],
  ['Deepak Meena', 'B+', 'Wicket-Keeper', 'B'],
  ['Eshan Fernandes', 'B+', 'All-Rounder', ''],
  ['Girish Naik', 'B+', 'Bowler', 'B'],
  ['Hitesh Chavan', 'B+', 'Batsman', ''],
  ['Ishan Dutta', 'B+', 'All-Rounder', 'B'],
  ['Jatin Malhotra', 'B+', 'Bowler', ''],
  ['Kabir Sethi', 'B+', 'Batsman', 'B'],
  ['Lokesh Bhoir', 'B+', 'Wicket-Keeper', ''],

  ['Mayur Salvi', 'B', 'Bowler', ''],
  ['Nakul Barve', 'B', 'Batsman', ''],
  ['Ojas Kelkar', 'B', 'All-Rounder', ''],
  ['Pravin Shinde', 'B', 'Bowler', ''],
  ['Qasim Baig', 'B', 'Batsman', ''],
  ['Rajat Dubey', 'B', 'All-Rounder', ''],
  ['Sagar Palkar', 'B', 'Bowler', ''],
  ['Tejas Ghadge', 'B', 'Wicket-Keeper', ''],
  ['Umesh Waghmare', 'B', 'Batsman', ''],
  ['Varun Lohia', 'B', 'All-Rounder', ''],
  ['Wasim Tamboli', 'B', 'Bowler', ''],
  ['Xerxes Mistry', 'B', 'Batsman', ''],
  ['Yogesh Gaikwad', 'B', 'All-Rounder', ''],
  ['Zoheb Kazi', 'B', 'Bowler', ''],
  ['Ajinkya More', 'B', 'Wicket-Keeper', ''],
  ['Bhavesh Rane', 'B', 'Batsman', ''],
  ['Chirag Sonar', 'B', 'All-Rounder', ''],
  ['Danish Attar', 'B', 'Bowler', ''],
  ['Ekansh Tiwari', 'B', 'Batsman', ''],
  ['Farhan Dalvi', 'B', 'All-Rounder', ''],
];

function buildSeed() {
  const categories = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i }));
  const priceOf = (cat) => {
    const found = categories.find((c) => c.name === cat);
    return found ? found.basePrice : 1;
  };
  const players = RAW_PLAYERS.map(([name, primary, role, secondary], idx) => ({
    id: 'P' + String(idx + 1).padStart(3, '0'),
    name,
    photo: '',
    primaryCategory: primary,
    secondaryCategory: secondary || '',
    role,
    basePrice: priceOf(primary),
    status: 'AVAILABLE',
    soldPrice: null,
    teamId: '',
    isCaptain: false,
    sequence: idx + 1,
    notes: '',
    timesAuctioned: 0,
  }));
  const teams = DEFAULT_TEAMS.map((t) => ({
    id: t.id,
    name: t.name,
    owner: t.owner,
    color: t.color,
    logo: '',
    startingPurse: DEFAULT_SETTINGS.startingPurse,
    purse: DEFAULT_SETTINGS.startingPurse,
    spent: 0,
    minSquad: DEFAULT_SETTINGS.minSquad,
    maxSquad: DEFAULT_SETTINGS.maxSquad,
    captainId: '',
    status: 'ACTIVE',
  }));
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    categories,
    players,
    teams,
    state: {
      status: 'WAITING',
      started: false,
      currentPlayerId: '',
      currentBid: null,
      highestBidderTeamId: '',
      round: 1,
      pausedFrom: '',
      startedAt: '',
      completedAt: '',
      bidHistory: [],
    },
    history: [],
    counters: { transaction: 0 },
  };
}

module.exports = { buildSeed, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_TEAMS };
