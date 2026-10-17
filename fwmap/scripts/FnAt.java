import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.decompiler.*;
import java.io.*;

// Создать функции по адресам и декомпилировать их. Аргументы: <выход> <адрес>...
// Для обработчиков, на которые ссылаются только таблицы: анализ их не видит.
public class FnAt extends GhidraScript {
    public void run() throws Exception {
        String[] a = getScriptArgs();
        AddressSpace sp = currentProgram.getAddressFactory().getDefaultAddressSpace();
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter w = new PrintWriter(new FileWriter(a[0]));
        for (int i = 1; i < a.length; i++) {
            Address ad = sp.getAddress(Long.decode(a[i]));
            new DisassembleCommand(ad, null, true).applyTo(currentProgram, monitor);
            new CreateFunctionCmd(ad).applyTo(currentProgram, monitor);
            Function f = getFunctionAt(ad);
            w.println("/* ===== " + a[i] + " ===== */");
            if (f == null) { w.println("// no function"); continue; }
            DecompileResults r = di.decompileFunction(f, 60, monitor);
            w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// FAILED " + r.getErrorMessage());
        }
        w.close();
    }
}
