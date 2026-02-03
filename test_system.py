"""
System Health Check Script
Run this to verify all components are working
"""

import os
import sys

def check_python_version():
    """Check Python version"""
    print("1. Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print(f"   ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"   ❌ Python {version.major}.{version.minor}.{version.micro} (requires 3.8+)")
        return False

def check_dependencies():
    """Check if required packages are installed"""
    print("\n2. Checking dependencies...")

    required = [
        'flask',
        'flask_cors',
        'pandas',
        'numpy',
        'sklearn',
        'joblib'
    ]

    optional = [
        'tensorflow',
        'supabase',
        'psutil'
    ]

    all_good = True

    for package in required:
        try:
            __import__(package)
            print(f"   ✅ {package}")
        except ImportError:
            print(f"   ❌ {package} (REQUIRED)")
            all_good = False

    for package in optional:
        try:
            __import__(package)
            print(f"   ✅ {package}")
        except ImportError:
            print(f"   ⚠️  {package} (OPTIONAL)")

    return all_good

def check_files():
    """Check if required files exist"""
    print("\n3. Checking required files...")

    required_files = [
        'app.py',
        'inference_engine.py',
        'stream_processor.py',
        'train_lstm_autoencoder.py'
    ]

    all_good = True

    for file in required_files:
        if os.path.exists(file):
            print(f"   ✅ {file}")
        else:
            print(f"   ❌ {file} (MISSING)")
            all_good = False

    return all_good

def check_model_files():
    """Check if model files exist"""
    print("\n4. Checking ML model files...")

    model_files = [
        ('scaler.pkl', 'Scaler'),
        ('threshold.json', 'Threshold'),
        ('lstm_model.h5', 'LSTM Model')
    ]

    for file, name in model_files:
        if os.path.exists(file):
            print(f"   ✅ {name} ({file})")
        else:
            print(f"   ⚠️  {name} ({file}) - Run train_lstm_autoencoder.py")

def check_data_files():
    """Check if data files exist"""
    print("\n5. Checking data files...")

    data_files = [
        'pump_sensor_data_2000_anomaly.csv',
        'pump_sensor_sequence_1000_records.csv'
    ]

    found = False
    for file in data_files:
        if os.path.exists(file):
            print(f"   ✅ {file}")
            found = True

    if not found:
        print("   ⚠️  No data files found (simulation will not work)")

def check_env():
    """Check environment configuration"""
    print("\n6. Checking environment configuration...")

    if os.path.exists('.env'):
        print("   ✅ .env file exists")
        # Check if it has required keys
        with open('.env', 'r') as f:
            content = f.read()
            if 'SUPABASE_URL' in content:
                print("   ✅ SUPABASE_URL configured")
            else:
                print("   ⚠️  SUPABASE_URL not configured (will use in-memory mode)")

            if 'SUPABASE_ANON_KEY' in content:
                print("   ✅ SUPABASE_ANON_KEY configured")
            else:
                print("   ⚠️  SUPABASE_ANON_KEY not configured (will use in-memory mode)")
    else:
        print("   ⚠️  .env file not found (will use in-memory mode)")
        print("   💡 Copy .env.example to .env and add your Supabase credentials")

def check_dashboard_files():
    """Check dashboard files"""
    print("\n7. Checking dashboard files...")

    dashboard_files = [
        ('index.html', 'Original Dashboard'),
        ('index-improved.html', 'Improved Dashboard'),
        ('dashboard.js', 'Original JavaScript'),
        ('dashboard-improved.js', 'Improved JavaScript'),
        ('styles.css', 'Original Styles'),
        ('styles-responsive.css', 'Responsive Styles')
    ]

    for file, name in dashboard_files:
        if os.path.exists(file):
            print(f"   ✅ {name} ({file})")
        else:
            print(f"   ❌ {name} ({file}) (MISSING)")

def main():
    """Run all checks"""
    print("=" * 60)
    print("INDUSTRIAL PUMP MONITORING - SYSTEM HEALTH CHECK")
    print("=" * 60)

    checks = [
        check_python_version(),
        check_dependencies(),
        check_files()
    ]

    # Optional checks (don't affect overall status)
    check_model_files()
    check_data_files()
    check_env()
    check_dashboard_files()

    print("\n" + "=" * 60)
    if all(checks):
        print("✅ ALL REQUIRED CHECKS PASSED")
        print("\nYou can now run:")
        print("  python app.py")
        print("\nThen open: http://localhost:5000")
    else:
        print("❌ SOME REQUIRED CHECKS FAILED")
        print("\nPlease fix the issues above before running the application.")
    print("=" * 60)

if __name__ == "__main__":
    main()
