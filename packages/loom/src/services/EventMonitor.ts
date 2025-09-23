import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { decodeAbiParameters, parseAbiParameters } from 'viem';
import { AttestationEvent, LoomConfig, EASAttestation } from '../types';
import { EAS_ABI, FIXED_ADDRESSES, EAS_CONFIG } from '../abis/placeholders';

export class EventMonitor extends EventEmitter {
  private config: LoomConfig;
  private provider: ethers.JsonRpcProvider;
  private easContract: ethers.Contract;
  private isRunning = false;
  private pollingTimer?: NodeJS.Timeout;
  private lastProcessedBlock?: number;

  constructor(config: LoomConfig) {
    super();
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    this.easContract = new ethers.Contract(
      config.easMonitoring.contractAddress,
      EAS_ABI,
      this.provider
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Event monitor is already running');
    }

    this.isRunning = true;
    console.log('🎧 Starting EAS on-chain event monitor...');
    console.log(`📍 EAS Contract: ${this.config.easMonitoring.contractAddress}`);
    console.log(`🔍 Schema ID: ${this.config.easMonitoring.schemaId}`);
    console.log(`👥 Target Attesters: ${this.config.easMonitoring.targetAddresses.join(', ')}`);
    
    // Calculate starting block based on configured days ago
    const currentBlock = await this.provider.getBlockNumber();
    const daysAgo = this.config.easMonitoring.startFromDaysAgo;
    
    // Arbitrum has ~0.25 second block time, so ~14,400 blocks per hour, ~345,600 blocks per day
    const arbitrumBlocksPerDay = 345600;
    const blocksToGoBack = Math.floor(daysAgo * arbitrumBlocksPerDay);
    
    this.lastProcessedBlock = Math.max(1, currentBlock - blocksToGoBack);
    console.log(`🧱 Starting from ${daysAgo} days ago (block: ${this.lastProcessedBlock}, current: ${currentBlock})`);
    
    await this.pollForEvents();
    this.scheduleNextPoll();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    console.log('Event monitor stopped');
  }

  private async pollForEvents(): Promise<void> {
    try {
      console.log('🔍 Polling for new EAS attestation events...');
      
      const events = await this.fetchAttestationEvents();
      
      if (events.length > 0) {
        console.log(`📨 Found ${events.length} new attestation events`);
        
        // Sort events by block number and log index to process them in order
        const sortedEvents = events.sort((a, b) => a.blockNumber - b.blockNumber);
        
        for (const event of sortedEvents) {
          if (this.shouldProcessEvent(event)) {
            console.log(`✅ Processing attestation ${event.id} from ${event.address}`);
            this.emit('attestationEvent', event);
          }
        }
        
        // Update last processed block
        if (sortedEvents.length > 0) {
          this.lastProcessedBlock = Math.max(...sortedEvents.map(e => e.blockNumber));
        }
      }
    } catch (error) {
      console.error('❌ Error polling for events:', error);
      this.emit('error', error);
    }
  }

  private async fetchAttestationEvents(): Promise<AttestationEvent[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.lastProcessedBlock ? this.lastProcessedBlock + 1 : currentBlock - 100;
      
      console.log(`📡 Querying blocks ${fromBlock} to ${currentBlock}`);
      
      // Create event filters for Attested events from our target attesters with our schema
      const filters = this.config.easMonitoring.targetAddresses.map(attester => 
        this.easContract.filters.Attested(
          null, // recipient (any)
          attester, // specific attester we want to monitor
          null, // uid (any)
          this.config.easMonitoring.schemaId // only our schema
        )
      );

      // Get events from the specified block range for each target attester
      const allLogs = await Promise.all(
        filters.map(filter => this.easContract.queryFilter(filter, fromBlock, currentBlock))
      );
      
      // Flatten the results and remove duplicates by transaction hash + log index
      const logs = allLogs.flat();
      const uniqueLogs = logs.filter((log, index, array) => 
        array.findIndex(l => l.transactionHash === log.transactionHash && l.index === log.index) === index
      );
      
      console.log(`📋 Found ${uniqueLogs.length} total Attested events from target attesters`);

      const attestationEvents: AttestationEvent[] = [];

      for (const log of uniqueLogs) {
        try {
          const parsedLog = log as ethers.EventLog;
          
          // Extract data from the log
          const uid = parsedLog.args.uid;
          const attester = parsedLog.args.attester;
          const recipient = parsedLog.args.recipient;
          
          console.log(`🔍 Processing attestation: UID=${uid}, Attester=${attester}`);

          // Get the full attestation data from the contract
          const attestationData = await this.easContract.getAttestation(uid);
          
          // Decode the attestation data using our schema
          const decodedData = this.decodeAttestationData(attestationData.data);
          
          if (!decodedData) {
            console.log(`⚠️  Could not decode attestation data for UID ${uid}`);
            continue;
          }

          // Create EASAttestation object
          const easAttestation: EASAttestation = {
            id: uid,
            attester: attestationData.attester,
            recipient: attestationData.recipient,
            refUID: attestationData.refUID,
            revocationTime: Number(attestationData.revocationTime),
            expirationTime: Number(attestationData.expirationTime),
            time: Number(attestationData.time),
            txid: parsedLog.transactionHash,
            schemaId: this.config.easMonitoring.schemaId,
            data: attestationData.data,
            marketAddress: decodedData.marketAddress,
            marketId: decodedData.marketId.toString(),
            questionId: decodedData.questionId,
            prediction: decodedData.prediction.toString(),
            comment: decodedData.comment,
            createdAt: new Date(Number(attestationData.time) * 1000).toISOString(),
            updatedAt: new Date(Number(attestationData.time) * 1000).toISOString()
          };

          // Create AttestationEvent
          const event: AttestationEvent = {
            id: uid,
            address: attester,
            timestamp: Number(attestationData.time) * 1000,
            blockNumber: parsedLog.blockNumber,
            transactionHash: parsedLog.transactionHash,
            data: easAttestation
          };

          attestationEvents.push(event);
        } catch (error) {
          console.error(`❌ Error processing log:`, error);
          continue;
        }
      }

      return attestationEvents;
    } catch (error) {
      console.error('❌ Error fetching events:', error);
      throw error;
    }
  }

  private decodeAttestationData(data: string): {
    marketAddress: string;
    marketId: bigint;
    questionId: string;
    prediction: bigint;
    comment: string;
  } | null {
    try {
      // Use the schema structure from EAS_CONFIG
      const decoded = decodeAbiParameters(
        parseAbiParameters(EAS_CONFIG.SCHEMA_STRUCTURE),
        data as `0x${string}`
      );

      return {
        marketAddress: decoded[0] as string,
        marketId: decoded[1] as bigint,
        questionId: decoded[2] as string,
        prediction: decoded[3] as bigint,
        comment: decoded[4] as string
      };
    } catch (error) {
      console.error('Failed to decode attestation data:', error);
      return null;
    }
  }

  private shouldProcessEvent(event: AttestationEvent): boolean {
    const easData = event.data;
    
    // Check if attestation has required fields for prediction market
    if (!easData.marketAddress || !easData.marketId || !easData.prediction) {
      console.log(`⚠️  Skipping attestation ${event.id}: missing required prediction market fields`);
      return false;
    }
    
    // Note: Attester filtering is now done at the blockchain query level for efficiency
    console.log(`✅ Will process attestation ${event.id}: market ${easData.marketId} at ${easData.marketAddress}`);
    return true;
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;

    this.pollingTimer = setTimeout(() => {
      this.pollForEvents().then(() => {
        this.scheduleNextPoll();
      }).catch((error) => {
        console.error('Polling error, retrying...', error);
        this.scheduleNextPoll();
      });
    }, this.config.easMonitoring.pollingInterval);
  }
}