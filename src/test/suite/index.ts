import * as path from 'path';
import * as fs from 'fs';

// Use dynamic import for Mocha to avoid module issues
export function run(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Dynamic import of Mocha
      const Mocha = (await import('mocha')).default;
      
      // Create the mocha test
      const mocha = new Mocha({
        ui: 'tdd',
        color: true
      });

      const testsRoot = path.resolve(__dirname, '..');

      // Simple file discovery without glob
      const testFiles = findTestFiles(testsRoot);
      
      // Add files to the test suite
      testFiles.forEach((f: string) => mocha.addFile(f));

      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findTestFiles(fullPath));
      } else if (item.endsWith('.test.js')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors in file discovery
  }
  
  return files;
}
