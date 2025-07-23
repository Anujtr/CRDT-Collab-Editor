#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for CRDT Backend
 * 
 * This script runs all tests and generates a comprehensive report
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

interface TestResult {
  suite: string;
  passed: boolean;
  tests: number;
  failures: number;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime = Date.now();

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Backend Test Suite\n');

    // Test suites to run
    const testSuites = [
      { name: 'Unit Tests', pattern: 'tests/unit/**/*.test.ts' },
      { name: 'Integration Tests', pattern: 'tests/integration/**/*.test.ts' },
    ];

    for (const suite of testSuites) {
      await this.runTestSuite(suite.name, suite.pattern);
    }

    // Generate final report
    this.generateReport();
  }

  private async runTestSuite(suiteName: string, pattern: string): Promise<void> {
    console.log(`\n📋 Running ${suiteName}...`);
    console.log('━'.repeat(50));

    try {
      const command = `jest "${pattern}" --verbose --coverage=false --silent=false`;
      const output = execSync(command, { 
        encoding: 'utf8',
        timeout: 60000,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      // Parse output for test results
      const testResult = this.parseTestOutput(suiteName, output);
      this.results.push(testResult);

      console.log(`✅ ${suiteName} completed`);
      console.log(`   Tests: ${testResult.tests}, Failures: ${testResult.failures}`);

    } catch (error: any) {
      console.log(`❌ ${suiteName} failed`);
      console.log(`   Error: ${error.message}`);

      // Still record the result
      this.results.push({
        suite: suiteName,
        passed: false,
        tests: 0,
        failures: 1
      });
    }
  }

  private parseTestOutput(suiteName: string, output: string): TestResult {
    // Simple parsing of Jest output
    const testMatch = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
    const passed = testMatch ? parseInt(testMatch[1]) : 0;
    const failed = testMatch && testMatch[2] ? parseInt(testMatch[2]) : 0;

    return {
      suite: suiteName,
      passed: failed === 0,
      tests: passed + failed,
      failures: failed
    };
  }

  private generateReport(): void {
    const endTime = Date.now();
    const duration = (endTime - this.startTime) / 1000;

    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(60));

    let totalTests = 0;
    let totalFailures = 0;
    let passedSuites = 0;

    console.log('\n📋 Test Suite Results:');
    console.log('─'.repeat(60));

    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      const line = `${status} ${result.suite.padEnd(20)} ${result.tests} tests, ${result.failures} failures`;
      console.log(line);

      totalTests += result.tests;
      totalFailures += result.failures;
      if (result.passed) passedSuites++;
    }

    console.log('─'.repeat(60));
    console.log(`📈 Overall Summary:`);
    console.log(`   Test Suites: ${passedSuites}/${this.results.length} passed`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Failures: ${totalFailures}`);
    console.log(`   Duration: ${duration.toFixed(2)}s`);

    const overallPass = totalFailures === 0;
    console.log(`\n🎯 Overall Result: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);

    if (overallPass) {
      console.log('\n🎉 All tests passed! Backend is fully functional.');
    } else {
      console.log('\n⚠️  Some tests failed. Review the output above for details.');
    }

    // Save report to file
    this.saveReportToFile({
      overallPass,
      duration,
      totalTests,
      totalFailures,
      passedSuites,
      totalSuites: this.results.length,
      results: this.results
    });
  }

  private saveReportToFile(report: any): void {
    const reportPath = path.join(__dirname, '../test-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(console.error);
}

export { TestRunner };